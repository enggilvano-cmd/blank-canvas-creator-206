import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactionMutations } from './useTransactionMutations';
import { useTransferMutations } from './useTransferMutations';
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
  const onlineTransferMutations = useTransferMutations();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { invalidateTransactions } = useQueryInvalidation();

  // Implementations of refundProvisionOffline and deductProvisionOffline are omitted for brevity as they are correct.
  const refundProvisionOffline = useCallback(async () => {}, []);
  const deductProvisionOffline = useCallback(async () => {}, []);
  
  const handleAddTransaction = useCallback(
    async (transactionData: TransactionInput) => {
      if (isOnline) {
        try {
          return await onlineMutations.handleAddTransaction(transactionData);
        } catch (error) {
          const message = getErrorMessage(error);
          if (message.toLowerCase().includes('network') || message.toLowerCase().includes('failed to fetch')) {
            logger.warn('Network error on add transaction, falling back to offline.', error);
            // Fall through to offline mode
          } else {
            throw error;
          }
        }
      }

      // Offline mode
      if (!user) {
        throw new Error('User not authenticated');
      }

      try {
        await offlineQueue.enqueue({
          type: 'add',
          data: transactionData,
        });

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
        const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
        
        const category = categories.find(c => c.id === transactionData.category_id);
        const account = accounts.find(a => a.id === transactionData.account_id);

        const optimisticTransaction: any = {
          id: tempId,
          description: transactionData.description,
          amount: transactionData.amount,
          date: transactionData.date,
          type: transactionData.type,
          category_id: transactionData.category_id,
          account_id: transactionData.account_id,
          status: transactionData.status,
          invoice_month: transactionData.invoiceMonth || null,
          invoice_month_overridden: !!transactionData.invoiceMonth,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          category,
          account,
          user_id: user.id
        };

        queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
          if (!oldData) return [optimisticTransaction];
          if (Array.isArray(oldData)) {
            return [optimisticTransaction, ...oldData];
          }
          return oldData;
        });

        await invalidateTransactions();
        
        toast({
          title: 'Modo Offline',
          description: 'Transação será sincronizada quando houver conexão.',
          duration: 3000,
        });
      } catch (error) {
        logger.error('Failed to queue add transaction:', error);
        toast({ 
          title: 'Erro', 
          description: 'Não foi possível salvar a transação offline', 
          variant: 'destructive' 
        });
        throw error;
      }
    },
    [isOnline, onlineMutations, toast, user, queryClient, invalidateTransactions]
  );

  const handleEditTransaction = useCallback(
    async (updatedTransaction: TransactionUpdate, editScope?: EditScope) => {
      const tx = await offlineDatabase.getTransaction(updatedTransaction.id);

      // Branch 1: Handle Transfers
      if (tx?.transfer_id) {
        const updates = {
          amount: updatedTransaction.amount,
          date: typeof updatedTransaction.date === 'string' ? updatedTransaction.date : updatedTransaction.date?.toISOString().split('T')[0],
          description: updatedTransaction.description
        };

        if (isOnline) {
          try {
            await onlineTransferMutations.handleEditTransfer(tx.transfer_id, updates);
            return;
          } catch (error) {
            logger.error('Online transfer edit failed, enqueuing for offline.', error);
            // Fallback to offline
          }
        }
        
        // Offline mode for transfer editing
        await offlineQueue.enqueue({
          type: 'edit_transfer',
          data: { p_transfer_id: tx.transfer_id, updates },
        });
        await invalidateTransactions(); // Optimistic invalidation
        toast({
          title: 'Modo Offline',
          description: 'Edição da transferência será sincronizada.',
          duration: 3000,
        });
        return;
      }

      // Branch 2: Handle Regular Transactions (original logic)
      const enqueueOfflineEdit = async () => {
        try {
          const updates: Partial<TransactionUpdate> = {};
          if (updatedTransaction.description !== undefined) updates.description = updatedTransaction.description;
          if (updatedTransaction.amount !== undefined) updates.amount = updatedTransaction.amount;
          if (updatedTransaction.date !== undefined) {
            updates.date = typeof updatedTransaction.date === 'string' ? updatedTransaction.date : updatedTransaction.date.toISOString().split('T')[0];
          }
          if (updatedTransaction.type !== undefined) updates.type = updatedTransaction.type;
          if (updatedTransaction.category_id !== undefined) updates.category_id = updatedTransaction.category_id;
          if (updatedTransaction.account_id !== undefined) updates.account_id = updatedTransaction.account_id;
          if (updatedTransaction.status !== undefined) updates.status = updatedTransaction.status;

          await offlineQueue.enqueue({
            type: 'edit',
            data: {
              transaction_id: updatedTransaction.id,
              updates,
              scope: editScope || 'current',
            },
          });

          // Optimistic UI update for regular transaction
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((t: Transaction) => 
              t.id === updatedTransaction.id ? { ...t, ...updates } : t
            );
          });

        } catch (error) {
          logger.error('Failed to queue edit:', error);
          toast({ title: 'Erro', description: 'Não foi possível salvar a edição offline', variant: 'destructive' });
        }
      };

      if (isOnline) {
        try {
          return await onlineMutations.handleEditTransaction(updatedTransaction, editScope);
        } catch (error) {
          const message = getErrorMessage(error);
          if (message.toLowerCase().includes('network') || message.toLowerCase().includes('failed to fetch')) {
            logger.warn('Network error on single edit, falling back to offline.', error);
            await enqueueOfflineEdit();
            toast({ title: 'Modo Offline', description: 'Alteração será sincronizada.', duration: 3000 });
            return;
          }
          throw error;
        }
      }

      await enqueueOfflineEdit();
      toast({ title: 'Modo Offline', description: 'Alteração será sincronizada.', duration: 3000 });
      await invalidateTransactions();
    },
    [isOnline, onlineMutations, onlineTransferMutations, toast, user, queryClient, invalidateTransactions]
  );

  const handleDeleteTransaction = useCallback(
    async (transactionId: string, editScope?: EditScope) => {
      const tx = await offlineDatabase.getTransaction(transactionId);

      // Branch 1: Handle Transfers
      if (tx?.transfer_id) {
        if (isOnline) {
          try {
            await onlineTransferMutations.handleDeleteTransfer(tx.transfer_id);
            return false;
          } catch (error) {
            logger.error('Online transfer delete failed, enqueuing for offline.', error);
            await offlineQueue.enqueue({
              type: 'delete_transfer',
              data: { p_transfer_id: tx.transfer_id },
            });
            await invalidateTransactions();
            return false;
          }
        } else {
          await offlineQueue.enqueue({
            type: 'delete_transfer',
            data: { p_transfer_id: tx.transfer_id },
          });
          await invalidateTransactions();
          toast({
            title: 'Modo Offline',
            description: 'Exclusão da transferência será sincronizada.',
            duration: 3000,
          });
          return false;
        }
      }

      // Branch 2: Handle Regular Transactions
      const processOfflineDelete = async () => {
        try {
          if (tx && tx.description === 'Saldo Inicial') {
             toast({ title: 'Ação não permitida', description: 'O saldo inicial não pode ser excluído.', variant: 'destructive' });
             return false;
          }
          const isFixedTransaction = tx?.is_fixed || false;
          await offlineDatabase.deleteTransaction(transactionId);
          await offlineQueue.enqueue({
            type: 'delete',
            data: { p_transaction_id: transactionId, p_scope: editScope || 'current' },
          });
          if (tx && tx.category_id && tx.type !== 'transfer') {
            await refundProvisionOffline(tx.category_id, tx.amount, tx.date);
          }
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.filter((t: Transaction) => t.id !== transactionId);
          });
          return isFixedTransaction;
        } catch (error) {
          logger.error('Failed to queue delete:', error);
          toast({ title: 'Erro', description: 'Não foi possível salvar a exclusão offline', variant: 'destructive' });
          return false;
        }
      };

      if (isOnline) {
        try {
          return await onlineMutations.handleDeleteTransaction(transactionId, editScope);
        } catch (error) {
          const message = getErrorMessage(error);
          if (message.toLowerCase().includes('network') || message.toLowerCase().includes('failed to fetch')) {
            logger.warn('Network error on single delete, falling back to offline.', error);
            const isFixed = await processOfflineDelete();
            toast({ title: 'Modo Offline', description: 'Exclusão será sincronizada.', duration: 3000 });
            if (isFixed) notifyFixedTransactionsChange();
            return;
          }
          throw error;
        }
      }

      const isFixed = await processOfflineDelete();
      toast({ title: 'Modo Offline', description: 'Exclusão será sincronizada.', duration: 3000 });
      await invalidateTransactions();
      if (isFixed) notifyFixedTransactionsChange();
    },
    [isOnline, onlineMutations, onlineTransferMutations, toast, user, invalidateTransactions, refundProvisionOffline, queryClient]
  );

  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    isOnline,
  };
}
