import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactionMutations } from './useTransactionMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/queryClient';
import { TransactionInput, TransactionUpdate, Category, Account, Transaction } from '@/types';
import { EditScope } from '@/components/TransactionScopeDialog';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/types/errors';
import { notifyFixedTransactionsChange } from '@/hooks/useFixedTransactions';

import { offlineSync } from '@/lib/offlineSync';

export function useOfflineTransactionMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useTransactionMutations();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { invalidateTransactions } = useQueryInvalidation();

  // ✅ Helper para descontar provisão em modo offline
  const deductProvisionOffline = useCallback(async (
    categoryId: string,
    transactionAmount: number,
    transactionDate: Date | string
  ) => {
    try {
      if (!user) return;

      const dateObj = typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate;
      const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      const endOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);

      // Buscar provisões do offlineDatabase de forma otimizada
      // Usar getTransactions com userId e filtrar por data se possível via options (mas getTransactions filtra por monthsBack)
      // Vamos pegar apenas os últimos 3 meses (padrão) que deve cobrir a provisão do mês atual
      const allTransactions = await offlineDatabase.getTransactions(user.id, 3);
      
      const provisions = allTransactions.filter(t =>
        t.category_id === categoryId &&
        t.is_provision === true &&
        new Date(t.date) >= startOfMonth &&
        new Date(t.date) <= endOfMonth
      );

      if (provisions.length === 0) return;

      const provision = provisions[0];
      const newAmount = (provision.amount ?? 0) - transactionAmount;

      // Atualizar no offlineDatabase
      const updated = { ...provision, amount: newAmount };
      await offlineDatabase.saveTransactions([updated]);

      // Atualizar no cache React Query
      queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((t: any) =>
          t.id === provision.id ? { ...t, amount: newAmount } : t
        );
      });

      logger.info(`✅ Provisão descontada offline: ${categoryId} -${transactionAmount}`);
    } catch (error) {
      logger.error('Erro ao descontar provisão offline:', error);
    }
  }, [user, queryClient]);

  // ✅ Helper para reembolsar provisão em modo offline
  const refundProvisionOffline = useCallback(async (
    categoryId: string,
    transactionAmount: number,
    transactionDate: Date | string
  ) => {
    try {
      const dateObj = typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate;
      const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      const endOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);

      const allTransactions = await offlineDatabase.getTransactions();
      const provisions = allTransactions.filter(t =>
        t.user_id === user?.id &&
        t.category_id === categoryId &&
        t.is_provision === true &&
        new Date(t.date) >= startOfMonth &&
        new Date(t.date) <= endOfMonth
      );

      if (provisions.length === 0) return;

      const provision = provisions[0];
      const newAmount = (provision.amount ?? 0) + transactionAmount;

      const updated = { ...provision, amount: newAmount };
      await offlineDatabase.saveTransactions([updated]);

      queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((t: any) =>
          t.id === provision.id ? { ...t, amount: newAmount } : t
        );
      });

      logger.info(`✅ Provisão reembolsada offline: ${categoryId} +${transactionAmount}`);
    } catch (error) {
      logger.error('Erro ao reembolsar provisão offline:', error);
    }
  }, [user, queryClient]);

  const handleAddTransaction = useCallback(async (transactionData: TransactionInput) => {
    const processOfflineAdd = async () => {
      try {
        if (!user) throw new Error('User not authenticated');

        const optimisticTx: Partial<Transaction> = {
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          user_id: user.id,
          description: transactionData.description,
          amount:
            transactionData.type === 'expense'
              ? -Math.abs(transactionData.amount)
              : Math.abs(transactionData.amount),
          date: transactionData.date.toISOString().split('T')[0],
          type: transactionData.type,
          category_id: transactionData.category_id,
          account_id: transactionData.account_id,
          status: transactionData.status,
          invoice_month: transactionData.invoiceMonth || null,
          invoice_month_overridden: !!transactionData.invoiceMonth,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // ✅ 1. Optimistic Update: Injeta a transação diretamente no cache do React Query
        // Isso garante que a UI atualize imediatamente (< 30ms) ANTES de persistir
        const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
        const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
        const category = categories.find(c => c.id === transactionData.category_id);
        const account = accounts.find(a => a.id === transactionData.account_id);

        const optimisticTxForUI = {
          ...optimisticTx,
          date: new Date(optimisticTx.date || new Date()), // UI espera Date object
          category: category,
          account: account,
          to_account: null, // Default para não quebrar UI
          installments: 1,
          current_installment: 1,
          is_recurring: false,
          is_fixed: false,
        };

        // Atualiza todas as listas de transações ativas
        queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
          if (!oldData) return [optimisticTxForUI];
          if (Array.isArray(oldData)) {
            return [optimisticTxForUI, ...oldData];
          }
          return oldData;
        });

        // Atualiza saldo da conta otimisticamente
        if (account) {
          queryClient.setQueryData<Account[]>(queryKeys.accounts, (oldAccounts) => {
            if (!oldAccounts) return oldAccounts;
            return oldAccounts.map(acc => {
              if (acc.id === account.id) {
                const newBalance = acc.balance + (optimisticTx.amount || 0);
                return { ...acc, balance: newBalance };
              }
              return acc;
            });
          });
        }

        // ✅ 2. Persistência em Background (Paralelizada)
        // Usamos Promise.all para salvar no DB e na Fila simultaneamente
        try {
          await Promise.all([
            offlineDatabase.saveTransactions([optimisticTx as Transaction]),
            offlineQueue.enqueue({
              type: 'transaction',
              data: {
                id: optimisticTx.id, // Include temp ID for mapping during sync
                description: transactionData.description,
                amount: transactionData.amount,
                date: transactionData.date.toISOString().split('T')[0],
                type: transactionData.type,
                category_id: transactionData.category_id,
                account_id: transactionData.account_id,
                status: transactionData.status,
                invoice_month: transactionData.invoiceMonth || null,
                invoice_month_overridden: !!transactionData.invoiceMonth,
              },
            })
          ]);
        } catch (persistError) {
          // ❌ Rollback em caso de erro na persistência
          logger.error('Erro na persistência, revertendo optimistic update:', persistError);
          
          // Reverter transações
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.filter((t: any) => t.id !== optimisticTx.id);
          });

          // Reverter saldo
          if (account) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (oldAccounts) => {
              if (!oldAccounts) return oldAccounts;
              return oldAccounts.map(acc => {
                if (acc.id === account.id) {
                  const originalBalance = acc.balance - (optimisticTx.amount || 0);
                  return { ...acc, balance: originalBalance };
                }
                return acc;
              });
            });
          }
          throw persistError; // Re-throw para ser capturado pelo catch externo
        }

        // ✅ Desconto automático de provisão em modo offline
        if (transactionData.category_id && transactionData.type !== 'transfer') {
          // Fire and forget para não bloquear UI (< 30ms requirement)
          deductProvisionOffline(
            transactionData.category_id,
            Math.abs(transactionData.amount),
            transactionData.date
          ).catch(err => logger.error('Erro background ao descontar provisão:', err));
        }

        // ⚠️ NÃO invalidar queries aqui!
        // O update otimista já atualizou a UI.
        // Se invalidarmos agora, o refetch vai buscar do servidor (que ainda não tem o dado)
        // e a transação vai "sumir" da tela até o próximo sync.
        // A invalidação será feita pelo offlineSync após confirmar o envio.
        // invalidateTransactions().catch(err => logger.error('Error invalidating transactions:', err));
      } catch (error) {
        logger.error('Failed to queue transaction:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível salvar a transação offline',
          variant: 'destructive',
        });
      }
    };

    // Sempre usar modo offline para resposta imediata (< 30ms)
    // O sync será feito em background se estiver online
    await processOfflineAdd();
    
    if (isOnline) {
      // Dispara sincronização em background sem aguardar
      offlineSync.syncAll().catch(err => 
        logger.error('Background sync failed:', err)
      );
    }
  }, [isOnline, onlineMutations, toast, user, queryClient, invalidateTransactions]);

  const handleEditTransaction = useCallback(
    async (updatedTransaction: TransactionUpdate, editScope?: EditScope) => {
      const enqueueOfflineEdit = async () => {
        try {
          const updates: Partial<TransactionUpdate> = {};

          if (updatedTransaction.description !== undefined) {
            updates.description = updatedTransaction.description;
          }
          if (updatedTransaction.amount !== undefined) {
            updates.amount = updatedTransaction.amount;
          }
          if (updatedTransaction.date !== undefined) {
            updates.date =
              typeof updatedTransaction.date === 'string'
                ? updatedTransaction.date
                : updatedTransaction.date.toISOString().split('T')[0];
          }
          if (updatedTransaction.type !== undefined) {
            updates.type = updatedTransaction.type;
          }
          if (updatedTransaction.category_id !== undefined) {
            updates.category_id = updatedTransaction.category_id;
          }
          if (updatedTransaction.account_id !== undefined) {
            updates.account_id = updatedTransaction.account_id;
          }
          if (updatedTransaction.status !== undefined) {
            updates.status = updatedTransaction.status;
          }
          if (updatedTransaction.invoice_month !== undefined) {
            updates.invoice_month = updatedTransaction.invoice_month || null;
          }

          await offlineQueue.enqueue({
            type: 'edit',
            data: {
              transaction_id: updatedTransaction.id,
              updates,
              scope: editScope || 'current',
            },
          });

          // ✅ Optimistic Update para Edição
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            
            return oldData.map((tx: Transaction) => {
              if (tx.id === updatedTransaction.id) {
                // Se mudou categoria ou conta, precisamos buscar os objetos completos
                let newCategory = tx.category;
                let newAccount = tx.account;

                if (updates.category_id && updates.category_id !== tx.category_id) {
                   const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
                   newCategory = categories.find(c => c.id === updates.category_id) || newCategory;
                }

                if (updates.account_id && updates.account_id !== tx.account_id) {
                   const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
                   newAccount = accounts.find(a => a.id === updates.account_id) || newAccount;
                }

                return {
                  ...tx,
                  ...updates,
                  date: updates.date ? new Date(updates.date) : tx.date,
                  category: newCategory,
                  account: newAccount,
                };
              }
              return tx;
            });
          });

          // ✅ Ajuste automático de provisões ao editar transação em modo offline
          if (updates.category_id || updates.amount || updates.date) {
            const allTransactions = await offlineDatabase.getTransactions();
            const originalTx = allTransactions.find(t => t.id === updatedTransaction.id);
            
            if (originalTx && originalTx.type !== 'transfer') {
              const newCategoryId = updates.category_id || originalTx.category_id;
              const oldCategoryId = originalTx.category_id;
              const newAmount = updates.amount ?? originalTx.amount;
              const oldAmount = originalTx.amount;
              const newDate = updates.date ? new Date(updates.date) : originalTx.date;

              // Se categoria mudou, reembolsar da antiga e descontar da nova
              if (newCategoryId !== oldCategoryId) {
                if (oldCategoryId) {
                  await refundProvisionOffline(oldCategoryId, oldAmount, originalTx.date);
                }
                if (newCategoryId) {
                  await deductProvisionOffline(newCategoryId, newAmount, newDate);
                }
              } else if (newAmount !== oldAmount && newCategoryId) {
                // Se apenas o valor mudou, reajustar o desconto
                const difference = newAmount - oldAmount;
                await deductProvisionOffline(newCategoryId, difference, newDate);
              }
            }
          }

        } catch (error) {
          logger.error('Failed to queue edit:', error);
          toast({
            title: 'Erro',
            description: 'Não foi possível salvar a edição offline',
            variant: 'destructive',
          });
        }
      };

      if (isOnline) {
        try {
          return await onlineMutations.handleEditTransaction(updatedTransaction, editScope);
        } catch (error) {
          const message = getErrorMessage(error);
          if (
            message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network') ||
            message.toLowerCase().includes('failed to send a request to the edge function') ||
            message.toLowerCase().includes('edge function') ||
            message.toLowerCase().includes('timeout') ||
            message.toLowerCase().includes('connection refused')
          ) {
            logger.warn('Network/Edge Function error ao editar transação, usando modo offline.', error);
            await enqueueOfflineEdit();
            toast({
              title: 'Modo Offline',
              description: 'Alteração será sincronizada quando voltar online.',
              duration: 3000,
            });
            return;
          }
          throw error;
        }
      }

      // Se não está online, usar modo offline
      await enqueueOfflineEdit();
      toast({
        title: 'Modo Offline',
        description: 'Alteração será sincronizada quando voltar online.',
        duration: 3000,
      });

      // ✅ Invalidar queries para refetch imediato
      await invalidateTransactions();
    },
    [isOnline, onlineMutations, toast, user, queryClient, invalidateTransactions, deductProvisionOffline]
  );

  const handleDeleteTransaction = useCallback(
    async (transactionId: string, editScope?: EditScope) => {
      const processOfflineDelete = async () => {
        try {
          // Check if it is "Saldo Inicial"
          const tx = await offlineDatabase.getTransaction(transactionId);
          if (tx && tx.description === 'Saldo Inicial') {
             toast({
                title: 'Ação não permitida',
                description: 'O saldo inicial não pode ser excluído. Edite a conta para alterar o saldo inicial.',
                variant: 'destructive'
             });
             return false;
          }

          // Verificar se é uma transação fixa ANTES de deletar
          const isFixedTransaction = tx?.is_fixed || false;

          await offlineDatabase.deleteTransaction(transactionId);

          await offlineQueue.enqueue({
            type: 'delete',
            data: {
              p_transaction_id: transactionId,
              p_scope: editScope || 'current',
            },
          });

          // ✅ Reembolsar provisão ao deletar em modo offline
          if (tx && tx.category_id && tx.type !== 'transfer') {
            await refundProvisionOffline(tx.category_id, tx.amount, tx.date);
          }

          // ✅ Optimistic Update para Exclusão
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            
            // Encontrar a transação para verificar se é uma transferência
            const transaction = oldData.find((tx: Transaction) => tx.id === transactionId);
            const linkedId = transaction?.linked_transaction_id;
            
            // Remover a transação e sua vinculada (se for transferência)
            return oldData.filter((tx: Transaction) => {
              if (tx.id === transactionId) return false;
              if (linkedId && tx.id === linkedId) return false;
              return true;
            });
          });

          return isFixedTransaction;
        } catch (error) {
          logger.error('Failed to queue delete:', error);
          toast({
            title: 'Erro',
            description: 'Não foi possível salvar a exclusão offline',
            variant: 'destructive',
          });
          return false;
        }
      };

      if (isOnline) {
        try {
          return await onlineMutations.handleDeleteTransaction(transactionId, editScope);
        } catch (error) {
          const message = getErrorMessage(error);
          if (
            message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network') ||
            message.toLowerCase().includes('failed to send a request to the edge function') ||
            message.toLowerCase().includes('edge function') ||
            message.toLowerCase().includes('timeout') ||
            message.toLowerCase().includes('connection refused')
          ) {
            logger.warn('Network/Edge Function error ao excluir transação, usando modo offline.', error);
            const isFixed = await processOfflineDelete();
            toast({
              title: 'Modo Offline',
              description: 'Exclusão será sincronizada quando voltar online.',
              duration: 3000,
            });
            // Notificar hook de transações fixas se necessário
            if (isFixed) {
              notifyFixedTransactionsChange();
            }
            return;
          }
          throw error;
        }
      }

      // Se não está online, usar modo offline
      const isFixed = await processOfflineDelete();
      toast({
        title: 'Modo Offline',
        description: 'Exclusão será sincronizada quando voltar online.',
        duration: 3000,
      });

      // ✅ Invalidar queries para refetch imediato
      await invalidateTransactions();
      // ✅ Notificar hook de transações fixas se necessário
      if (isFixed) {
        notifyFixedTransactionsChange();
      }
    },
    [isOnline, onlineMutations, toast, user, invalidateTransactions, refundProvisionOffline]
  );

  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    isOnline,
  };
}
