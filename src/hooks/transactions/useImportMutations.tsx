import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import type { ImportTransactionData } from '@/types';
import { logger } from '@/lib/logger';
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
    if (usedIndexes.has(expenseIndex)) {return;}

    const isTransferOutgoing = Boolean(expenseData.to_account_id) && 
                              (expenseData.type === 'transfer' || expenseData.type === 'expense');
    
    if (!isTransferOutgoing) {return;}

    // Procurar por INCOME correspondente
    const incomeIndex = transactions.findIndex((incomeData, index) => {
      if (usedIndexes.has(index) || index === expenseIndex) {return false;}
      if (incomeData.type !== 'income') {return false;}

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
 * Processa um lote de transações em paralelo com rate limiting
 * @param items - Array de itens para processar
 * @param processor - Função que processa cada item
 * @param batchSize - Quantidade de itens por lote (default: 3)
 * @param delayMs - Delay entre lotes em ms (default: 800)
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = 3,
  delayMs: number = 800
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    logger.info(`[Import] 📦 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} itens)`);
    
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => processor(item, i + batchIndex))
    );
    results.push(...batchResults);
    
    // Delay entre lotes para evitar rate limit
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

export function useImportMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { invalidateTransactions } = useQueryInvalidation();

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (!user) {return;}
    
    const startTime = Date.now();
    
    try {
      logger.info('[Import] 🚀 Iniciando importação otimizada:', {
        totalTransactions: transactionsData.length,
        transactionsToReplace: transactionsToReplace.length
      });

      // 1. Deletar transações que serão substituídas (em paralelo)
      if (transactionsToReplace.length > 0) {
        logger.info('[Import] 🗑️ Deletando transações a substituir...');
        await Promise.allSettled(
          transactionsToReplace.map(txId =>
            supabase.functions.invoke('atomic-delete-transaction', {
              body: { transaction_id: txId, scope: 'current' }
            })
          )
        );
      }

      // 2. Batch lookup de categorias (otimizado)
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

      // Criar categorias faltantes em uma única operação batch
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

      // 3. Separar transações por tipo
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

      // Ordenar parcelas dentro de cada grupo
      installmentGroups.forEach((group) => {
        group.sort((a, b) => (a.current_installment || 0) - (b.current_installment || 0));
      });

      // 4. Detectar pares de transferência
      const { pairs: inferredTransferPairs, remaining: transactionsToProcess } = 
        detectTransferPairs(nonInstallmentTransactions);

      logger.info('[Import] 📊 Análise concluída:', {
        totalLinhas: transactionsData.length,
        gruposParcelados: installmentGroups.size,
        transferencias: inferredTransferPairs.length,
        transacoesSimples: transactionsToProcess.length
      });

      // Contadores de resultado
      let successCount = 0;
      let errorCount = 0;

      // 5. Processar TRANSFERÊNCIAS em lotes de 2 (cada uma cria 2 transações)
      if (inferredTransferPairs.length > 0) {
        logger.info('[Import] 💸 Processando transferências...');
        
        const transferResults = await processBatch(
          inferredTransferPairs,
          async (pair) => {
            const status = pair.expense.status === 'pending' || pair.income.status === 'pending'
              ? 'pending'
              : (pair.expense.status || pair.income.status || 'completed');

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
            
            if (result.error) {throw result.error;}
            return result;
          },
          2, // Lotes de 2 transferências
          1000 // 1 segundo entre lotes
        );

        transferResults.forEach(result => {
          if (result.status === 'fulfilled') {
            successCount += 2; // Cada transferência cria 2 transações
          } else {
            errorCount++;
            logger.error('[Import] ❌ Erro em transferência:', result.reason);
          }
        });
      }

      // 6. Processar PARCELAS sequencialmente com delay
      if (installmentGroups.size > 0) {
        logger.info('[Import] 📑 Processando grupos de parcelas...');
        
        for (const [, group] of installmentGroups) {
          const category_id = group[0].category ? categoryMap.get(group[0].category) || null : null;
          let parent_transaction_id: string | null = null;

          // Processar parcelas sequencialmente dentro do grupo (necessário para parent_id)
          for (const data of group) {
            // Garantir que o tipo é income ou expense (não transfer)
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
                  }
                }
              });

              if (result.error) {
                errorCount++;
                logger.error('[Import] ❌ Erro em parcela:', result.error);
                // Aguardar antes de continuar para evitar rate limit
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
              }

              const responseData = result.data as { transaction?: { id: string } };
              const transactionId = responseData?.transaction?.id;

              if (transactionId) {
                // Se não temos parent_transaction_id ainda, a primeira parcela se torna a pai
                if (!parent_transaction_id) {
                  parent_transaction_id = transactionId;
                }

                const updates: Record<string, unknown> = {
                  installments: data.installments,
                  current_installment: data.current_installment,
                  parent_transaction_id: parent_transaction_id
                };

                if (data.invoice_month) {
                  updates.invoice_month = data.invoice_month;
                  updates.invoice_month_overridden = true;
                }

                await supabase
                  .from('transactions')
                  .update(updates)
                  .eq('id', transactionId);

                successCount++;
              }
              
              // Delay entre parcelas para evitar rate limit
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
              errorCount++;
              logger.error('[Import] ❌ Exceção em parcela:', err);
            }
          }
        }
      }

      // 7. Processar TRANSAÇÕES SIMPLES em lotes de 5
      if (transactionsToProcess.length > 0) {
        logger.info('[Import] 💰 Processando transações simples...');
        
        const simpleResults = await processBatch(
          transactionsToProcess,
          async (data) => {
            // Converter 'transfer' para tipo válido se necessário
            let transactionType = data.type;
            if (transactionType === 'transfer') {
              // Se tem to_account_id, deveria ter sido tratada como transferência
              if (data.to_account_id) {
                throw new Error('Transferência não tratada corretamente');
              }
              // Senão, tratar como despesa
              transactionType = 'expense';
            }
            
            // Validar tipo final
            if (transactionType !== 'income' && transactionType !== 'expense') {
              throw new Error(`Tipo de transação não suportado: ${data.type}`);
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
                }
              }
            });

            if (result.error) {throw result.error;}

            // Atualizar metadados extras se necessário
            const responseData = result.data as { transaction?: { id: string } };
            const transactionId = responseData?.transaction?.id;

            if (transactionId && data.invoice_month) {
              await supabase
                .from('transactions')
                .update({
                  invoice_month: data.invoice_month,
                  invoice_month_overridden: true
                })
                .eq('id', transactionId);
            }

            return result;
          },
          3, // Lotes de 3 transações (reduzido)
          1000 // 1 segundo entre lotes
        );

        simpleResults.forEach(result => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            errorCount++;
            logger.error('[Import] ❌ Erro em transação:', result.reason);
          }
        });
      }

      // 8. Invalidar cache e atualizar UI
      await invalidateTransactions();

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const successRate = ((successCount / transactionsData.length) * 100).toFixed(1);

      logger.info('[Import] ✅ Importação concluída:', {
        tempo: `${elapsedTime}s`,
        total: transactionsData.length,
        sucesso: successCount,
        erros: errorCount,
        taxa: `${successRate}%`
      });

      toast({
        title: 'Importação concluída',
        description: `✅ ${successCount} de ${transactionsData.length} transações importadas (${successRate}%) em ${elapsedTime}s${errorCount > 0 ? ` | ❌ ${errorCount} erros` : ''}`,
      });

    } catch (error: unknown) {
      logger.error('[Import] ❌ Erro crítico na importação:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      const errorMessage = getErrorMessage(error);
      
      // Tratar erros específicos
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as Record<string, unknown>;
        
        if (errorObj.status === 429 || String(error).includes('429')) {
          toast({
            title: 'Limite de requisições excedido',
            description: '⏱️ Muitas requisições. Aguarde alguns segundos e tente novamente.',
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Erro na importação',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [user, invalidateTransactions, toast]);

  return {
    handleImportTransactions,
  };
}
