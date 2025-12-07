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
 * IMPORTANTE: Só detecta pares quando:
 * 1. A transação tem tipo 'transfer' explicitamente
 * 2. E tem uma conta destino (to_account_id) válida
 */
function detectTransferPairs(transactions: ImportTransactionData[]) {
  const pairs: DetectedTransferPair[] = [];
  const usedIndexes = new Set<number>();

  transactions.forEach((expenseData, expenseIndex) => {
    if (usedIndexes.has(expenseIndex)) return;

    // Só considera transferência REAL (tipo explicitamente 'transfer' E com conta destino)
    const isRealTransfer = expenseData.type === 'transfer' && Boolean(expenseData.to_account_id);
    
    if (!isRealTransfer) return;

    // Busca a transação de entrada correspondente (deve existir no arquivo)
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

    // Só cria par se encontrou a transação de entrada correspondente
    // Caso contrário, deixa como transação normal para ser processada individualmente
    if (incomeIndex !== -1) {
      usedIndexes.add(expenseIndex);
      usedIndexes.add(incomeIndex);
      
      pairs.push({ 
        expense: expenseData, 
        income: transactions[incomeIndex]
      });
    }
    // Se não encontrou par, a transação será tratada individualmente como transação normal
  });

  const remaining = transactions.filter((_, index) => !usedIndexes.has(index));
  return { pairs, remaining };
}

/**
 * Processa um lote de itens com delay entre lotes
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = 5,
  delayMs: number = 300
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => processor(item, i + batchIndex))
    );
    results.push(...batchResults);
    
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

export function useImportMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Fallback: processa transações usando as edge functions existentes
   */
  const processWithLegacyMethod = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[],
    categoryMap: Map<string, string>
  ) => {
    let successCount = 0;
    let errorCount = 0;

    // Deletar transações a substituir
    if (transactionsToReplace.length > 0) {
      await Promise.allSettled(
        transactionsToReplace.map(txId =>
          supabase.functions.invoke('atomic-delete-transaction', {
            body: { transaction_id: txId, scope: 'current' }
          })
        )
      );
    }

    // Separar por tipo
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

    installmentGroups.forEach((group) => {
      group.sort((a, b) => (a.current_installment || 0) - (b.current_installment || 0));
    });

    const { pairs: inferredTransferPairs, remaining: transactionsToProcess } = 
      detectTransferPairs(nonInstallmentTransactions);

    // Processar transferências
    if (inferredTransferPairs.length > 0) {
      const transferResults = await processBatch(
        inferredTransferPairs,
        async (pair) => {
          const status = pair.expense.status === 'pending' || pair.income.status === 'pending'
            ? 'pending' : 'completed';

          const result = await supabase.functions.invoke('atomic-transfer', {
            body: {
              transfer: {
                from_account_id: pair.expense.account_id,
                to_account_id: pair.income.account_id,
                amount: pair.expense.amount,
                date: pair.expense.date,
                outgoing_description: pair.expense.description,
                incoming_description: pair.income.description,
                status,
              }
            }
          });
          
          if (result.error) throw result.error;
          return result;
        },
        3, 500
      );

      transferResults.forEach(result => {
        if (result.status === 'fulfilled') successCount += 2;
        else errorCount++;
      });
    }

    // Processar parcelas
    for (const [, group] of installmentGroups) {
      const category_id = group[0].category ? categoryMap.get(group[0].category) || null : null;

      for (const data of group) {
        const transactionType = data.type === 'transfer' ? 'expense' : data.type;
        
        try {
          const result = await supabase.functions.invoke('atomic-transaction', {
            body: {
              transaction: {
                description: data.description,
                amount: data.amount,
                date: data.date,
                type: transactionType,
                category_id: category_id,
                account_id: data.account_id,
                status: data.status || 'completed',
                invoice_month: data.invoice_month || null,
              }
            }
          });

          if (result.error) {
            errorCount++;
          } else {
            successCount++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch {
          errorCount++;
        }
      }
    }

    // Processar transações simples
    if (transactionsToProcess.length > 0) {
      const simpleResults = await processBatch(
        transactionsToProcess,
        async (data) => {
          let transactionType = data.type;
          if (transactionType === 'transfer') {
            if (data.to_account_id) throw new Error('Transferência não tratada');
            transactionType = 'expense';
          }
          
          if (transactionType !== 'income' && transactionType !== 'expense') {
            throw new Error(`Tipo não suportado: ${data.type}`);
          }

          const category_id = data.category ? categoryMap.get(data.category) || null : null;

          const result = await supabase.functions.invoke('atomic-transaction', {
            body: {
              transaction: {
                description: data.description,
                amount: data.amount,
                date: data.date,
                type: transactionType,
                category_id: category_id,
                account_id: data.account_id,
                status: data.status || 'completed',
                invoice_month: data.invoice_month || null,
              }
            }
          });

          if (result.error) throw result.error;
          return result;
        },
        5, 300
      );

      simpleResults.forEach(result => {
        if (result.status === 'fulfilled') successCount++;
        else errorCount++;
      });
    }

    return { successCount, errorCount };
  }, []);

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (!user) return;
    
    const startTime = Date.now();
    
    try {
      // Log detalhado para debug de invoice_month
      const transactionsWithInvoiceMonth = transactionsData.filter(t => t.invoice_month);
      logger.info('[Import] 🚀 Iniciando importação:', {
        totalTransactions: transactionsData.length,
        transactionsToReplace: transactionsToReplace.length,
        transactionsWithInvoiceMonth: transactionsWithInvoiceMonth.length,
        invoiceMonthSamples: transactionsWithInvoiceMonth.slice(0, 5).map(t => ({
          description: t.description,
          invoice_month: t.invoice_month
        }))
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

      // Criar categorias faltantes
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
        created: categoriesToCreate.length
      });

      // 2. Tentar bulk import primeiro, fallback para método legado
      let successCount = 0;
      let errorCount = 0;
      let usedBulkImport = false;

      try {
        // Preparar dados para bulk import
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

        installmentGroups.forEach((group) => {
          group.sort((a, b) => (a.current_installment || 0) - (b.current_installment || 0));
        });

        const { pairs: inferredTransferPairs, remaining: transactionsToProcess } = 
          detectTransferPairs(nonInstallmentTransactions);

        const bulkTransactions: {
          description: string;
          amount: number;
          date: string;
          type: 'income' | 'expense';
          category_id: string | null;
          account_id: string;
          status: 'pending' | 'completed';
          invoice_month: string | null;
          installments: number | null;
          current_installment: number | null;
        }[] = transactionsToProcess
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
            installments: null as number | null,
            current_installment: null as number | null,
          }));

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
            ? 'pending' : 'completed') as 'pending' | 'completed',
        }));

        logger.info('[Import] 📦 Tentando bulk import...');

        const { data: result, error } = await supabase.functions.invoke('atomic-bulk-import', {
          body: {
            transactions: bulkTransactions,
            transfers: bulkTransfers,
            delete_ids: transactionsToReplace,
          }
        });

        if (error) throw error;

        successCount = (result?.transactions_created || 0) + (result?.transfers_created || 0) * 2;
        errorCount = result?.errors?.length || 0;
        usedBulkImport = true;

        logger.info('[Import] ✅ Bulk import bem-sucedido');

      } catch (bulkError) {
        logger.warn('[Import] ⚠️ Bulk import falhou, usando método legado:', {
          error: bulkError instanceof Error ? bulkError.message : String(bulkError)
        });

        // Fallback para método legado
        const legacyResult = await processWithLegacyMethod(
          transactionsData,
          transactionsToReplace,
          categoryMap
        );

        successCount = legacyResult.successCount;
        errorCount = legacyResult.errorCount;
      }

      // 3. Invalidar cache
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
      const totalRequested = transactionsData.length;
      const successRate = totalRequested > 0 ? ((successCount / totalRequested) * 100).toFixed(1) : '0';

      logger.info('[Import] ✅ Importação concluída:', {
        metodo: usedBulkImport ? 'bulk' : 'legado',
        tempo: `${elapsedTime}s`,
        total: totalRequested,
        sucesso: successCount,
        erros: errorCount,
        taxa: `${successRate}%`
      });

      toast({
        title: 'Importação concluída',
        description: `✅ ${successCount} de ${totalRequested} transações importadas (${successRate}%) em ${elapsedTime}s${errorCount > 0 ? ` | ❌ ${errorCount} erros` : ''}`,
      });

    } catch (error: unknown) {
      logger.error('[Import] ❌ Erro na importação:', {
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
  }, [user, queryClient, toast, processWithLegacyMethod]);

  return {
    handleImportTransactions,
  };
}
