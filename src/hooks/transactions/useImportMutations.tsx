import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ImportTransactionData } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

type DetectedTransferPair = {
  expense: ImportTransactionData;
  income: ImportTransactionData;
};

/**
 * Detecta pares de transferência no array de transações
 */
function detectTransferPairs(transactions: ImportTransactionData[]) {
  const pairs: DetectedTransferPair[] = [];
  const usedIndexes = new Set<number>();

  transactions.forEach((expenseData, expenseIndex) => {
    if (usedIndexes.has(expenseIndex)) return;

    const isTransferOutgoing = Boolean(expenseData.to_account_id) && 
                              (expenseData.type === 'transfer' || expenseData.type === 'expense');
    
    if (!isTransferOutgoing) return;

    // Procurar por INCOME correspondente
    const incomeIndex = transactions.findIndex((incomeData, index) => {
      if (usedIndexes.has(index) || index === expenseIndex) return false;
      if (incomeData.type !== 'income') return false;

      return (
        incomeData.account_id === expenseData.to_account_id &&
        incomeData.amount === expenseData.amount &&
        incomeData.date === expenseData.date &&
        !incomeData.to_account_id
      );
    });

    usedIndexes.add(expenseIndex);
    if (incomeIndex !== -1) {
      usedIndexes.add(incomeIndex);
    }
    
    pairs.push({ 
      expense: expenseData, 
      income: incomeIndex !== -1 ? transactions[incomeIndex] : {
        description: expenseData.description,
        amount: expenseData.amount,
        date: expenseData.date,
        type: 'income',
        account_id: expenseData.to_account_id!,
        status: expenseData.status,
        category: 'Transferência'
      } as ImportTransactionData
    });
  });

  const remaining = transactions.filter((_, index) => !usedIndexes.has(index));
  return { pairs, remaining };
}

export function useImportMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (!user) return;
    
    const startTime = Date.now();
    
    try {
      logger.info('[Import] 🚀 Iniciando importação BULK otimizada:', {
        totalTransactions: transactionsData.length,
        transactionsToReplace: transactionsToReplace.length
      });

      // 1. Batch lookup de categorias
      const uniqueCategoryNames = [...new Set(
        transactionsData
          .filter(data => data.category)
          .map(data => data.category!)
      )];

      const { data: existingCategories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user.id)
        .in('name', uniqueCategoryNames);

      const categoryMap = new Map<string, string>(
        existingCategories?.map(cat => [cat.name, cat.id]) || []
      );

      // Criar categorias faltantes em batch
      const categoriesToCreate = uniqueCategoryNames.filter(
        name => !categoryMap.has(name)
      );

      if (categoriesToCreate.length > 0) {
        const { data: newCategories } = await supabase
          .from('categories')
          .insert(
            categoriesToCreate.map(name => {
              const sampleTransaction = transactionsData.find(
                data => data.category === name
              );
              const categoryType: 'income' | 'expense' | 'both' = 
                sampleTransaction?.type === 'income' ? 'income' : 'expense';
              
              return { name, user_id: user.id, type: categoryType };
            })
          )
          .select('id, name');

        newCategories?.forEach(cat => {
          categoryMap.set(cat.name, cat.id);
        });
      }

      logger.info('[Import] 📁 Categorias processadas:', {
        existing: existingCategories?.length || 0,
        created: categoriesToCreate.length,
        total: categoryMap.size
      });

      // 2. Separar transações por tipo
      const installmentGroups = new Map<string, ImportTransactionData[]>();
      const nonInstallmentTransactions: ImportTransactionData[] = [];

      transactionsData.forEach((data) => {
        if (data.installments && data.current_installment && data.installments > 1) {
          const descBase = data.description.replace(/\s*-\s*Parcela\s*\d+.*$/i, '').trim();
          const groupKey = `${descBase}|${data.account_id}|${data.amount}|${data.installments}`;
          
          if (!installmentGroups.has(groupKey)) {
            installmentGroups.set(groupKey, []);
          }
          installmentGroups.get(groupKey)!.push(data);
        } else {
          nonInstallmentTransactions.push(data);
        }
      });

      // Ordenar parcelas
      installmentGroups.forEach((group) => {
        group.sort((a, b) => (a.current_installment || 0) - (b.current_installment || 0));
      });

      // 3. Detectar pares de transferência
      const { pairs: inferredTransferPairs, remaining: transactionsToProcess } = 
        detectTransferPairs(nonInstallmentTransactions);

      logger.info('[Import] 📊 Análise concluída:', {
        totalLinhas: transactionsData.length,
        gruposParcelados: installmentGroups.size,
        transferencias: inferredTransferPairs.length,
        transacoesSimples: transactionsToProcess.length
      });

      // 4. Preparar dados para bulk import
      const bulkTransactions = transactionsToProcess
        .filter(data => {
          const type = data.type === 'transfer' ? 'expense' : data.type;
          return type === 'income' || type === 'expense';
        })
        .map(data => ({
          description: data.description,
          amount: data.amount,
          date: data.date,
          type: (data.type === 'transfer' ? 'expense' : data.type) as 'income' | 'expense',
          category_id: data.category ? categoryMap.get(data.category) || null : null,
          account_id: data.account_id,
          status: data.status || 'completed',
          invoice_month: data.invoice_month || null,
          installments: null,
          current_installment: null,
        }));

      // Adicionar parcelas ao bulk
      for (const [, group] of installmentGroups) {
        for (const data of group) {
          const type = data.type === 'transfer' ? 'expense' : data.type;
          if (type !== 'income' && type !== 'expense') continue;
          
          bulkTransactions.push({
            description: data.description,
            amount: data.amount,
            date: data.date,
            type: type as 'income' | 'expense',
            category_id: data.category ? categoryMap.get(data.category) || null : null,
            account_id: data.account_id,
            status: data.status || 'completed',
            invoice_month: data.invoice_month || null,
            installments: data.installments || null,
            current_installment: data.current_installment || null,
          });
        }
      }

      const bulkTransfers = inferredTransferPairs.map(pair => ({
        from_account_id: pair.expense.account_id,
        to_account_id: pair.income.account_id,
        amount: pair.expense.amount,
        date: pair.expense.date,
        outgoing_description: pair.expense.description,
        incoming_description: pair.income.description,
        status: (pair.expense.status === 'pending' || pair.income.status === 'pending'
          ? 'pending'
          : 'completed') as 'pending' | 'completed',
      }));

      logger.info('[Import] 📦 Enviando bulk import:', {
        transactions: bulkTransactions.length,
        transfers: bulkTransfers.length,
        deleteIds: transactionsToReplace.length,
      });

      // 5. Chamar edge function de bulk import
      const { data: result, error } = await supabase.functions.invoke('atomic-bulk-import', {
        body: {
          transactions: bulkTransactions,
          transfers: bulkTransfers,
          delete_ids: transactionsToReplace,
        }
      });

      if (error) {
        throw error;
      }

      // 6. Invalidar cache
      await Promise.all([
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.transactionsBase,
          refetchType: 'all'
        }),
        queryClient.refetchQueries({ 
          queryKey: queryKeys.transactionsBase,
          type: 'all'
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalCreated = (result?.transactions_created || 0) + (result?.transfers_created || 0) * 2;
      const totalRequested = transactionsData.length;
      const successRate = ((totalCreated / totalRequested) * 100).toFixed(1);

      logger.info('[Import] ✅ Bulk import concluído:', {
        tempo: `${elapsedTime}s`,
        tempoServer: `${result?.elapsed_ms}ms`,
        total: totalRequested,
        sucesso: totalCreated,
        erros: result?.errors?.length || 0,
        taxa: `${successRate}%`
      });

      const errorCount = result?.errors?.length || 0;
      
      toast({
        title: 'Importação concluída',
        description: `✅ ${totalCreated} de ${totalRequested} transações importadas (${successRate}%) em ${elapsedTime}s${errorCount > 0 ? ` | ❌ ${errorCount} erros` : ''}`,
      });

    } catch (error: unknown) {
      logger.error('[Import] ❌ Erro na importação bulk:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      const errorMessage = getErrorMessage(error);
      
      toast({
        title: 'Erro na importação',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [user, queryClient, toast]);

  return {
    handleImportTransactions,
  };
}
