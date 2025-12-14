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

export function useOfflineTransactionMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useTransactionMutations();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { invalidateTransactions } = useQueryInvalidation();

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

        await offlineDatabase.saveTransactions([optimisticTx as Transaction]);

        await offlineQueue.enqueue({
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
        });

        // ✅ Optimistic Update: Injeta a transação diretamente no cache do React Query
        // Isso garante que a UI atualize imediatamente mesmo sem internet
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

        // ✅ Invalidar queries para garantir consistência eventual
        await invalidateTransactions();
      } catch (error) {
        logger.error('Failed to queue transaction:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível salvar a transação offline',
          variant: 'destructive',
        });
      }
    };

    if (isOnline) {
      try {
        return await onlineMutations.handleAddTransaction(transactionData);
      } catch (error) {
        const message = getErrorMessage(error);
        // Se o erro for de rede ou Edge Function indisponível, faz fallback para modo offline
        if (
          message.toLowerCase().includes('failed to fetch') || 
          message.toLowerCase().includes('network') ||
          message.toLowerCase().includes('failed to send a request to the edge function') ||
          message.toLowerCase().includes('edge function') ||
          message.toLowerCase().includes('timeout') ||
          message.toLowerCase().includes('connection refused')
        ) {
          logger.warn('Network/Edge Function error ao adicionar transação, usando modo offline.', error);
          await processOfflineAdd();
          toast({
            title: 'Modo Offline',
            description: 'Transação será sincronizada quando voltar online.',
            duration: 3000,
          });
          return;
        }
        throw error;
      }
    }

    // Se não está online, usar modo offline
    await processOfflineAdd();
    toast({
      title: 'Modo Offline',
      description: 'Transação será sincronizada quando voltar online.',
      duration: 3000,
    });
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
    [isOnline, onlineMutations, toast, user, invalidateTransactions]
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
    [isOnline, onlineMutations, toast, user, invalidateTransactions]
  );

  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    isOnline,
  };
}
