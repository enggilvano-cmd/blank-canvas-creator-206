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

/**
 * Executa uma função com retry exponencial
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Processa um lote de itens com delay entre lotes e retry
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = 2,
  delayMs: number = 800
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => 
        withRetry(() => processor(item, i + batchIndex), 3, 500)
      )
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
        async (data, index) => {
          let transactionType = data.type;
          
          // Transferências com to_account_id já foram processadas como pares
          // Se chegou aqui, trata como expense (transferência de saída sem par de entrada)
          if (transactionType === 'transfer') {
            transactionType = 'expense';
          }
          
          if (transactionType !== 'income' && transactionType !== 'expense') {
            logger.error('[Import] Tipo não suportado:', { 
              index, 
              type: data.type, 
              description: data.description 
            });
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

          if (result.error) {
            logger.error('[Import] Erro na transação:', {
              index,
              description: data.description,
              error: result.error
            });
            throw result.error;
          }
          return result;
        },
        5, 300
      );

      simpleResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          logger.error('[Import] Falha na transação:', {
            index,
            reason: result.reason
          });
          errorCount++;
        }
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
      logger.info('[Import] 🚀 Iniciando importação:', {
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
            installments: data.installments || null,
            current_installment: data.current_installment || null,
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
