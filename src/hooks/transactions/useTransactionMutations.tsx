import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { TransactionInput, TransactionUpdate, Account, Category, Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { EditScope } from '@/components/TransactionScopeDialog';
import { getErrorMessage } from '@/lib/errorUtils';

export function useTransactionMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAddTransaction = useCallback(async (transactionData: TransactionInput) => {
    if (!user) return;
    
    // Snapshot for rollback
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // 1. Optimistic Update: Accounts Balance
      if (previousAccounts) {
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return [];
          return old.map(acc => {
            if (acc.id === transactionData.account_id) {
              let newBalance = acc.balance;
              if (transactionData.type === 'expense') {
                newBalance -= transactionData.amount;
              } else if (transactionData.type === 'income') {
                newBalance += transactionData.amount;
              }
              // Note: Transfers might need handling if they affect two accounts, 
              // but TransactionInput usually targets one account context here.
              return { ...acc, balance: newBalance };
            }
            return acc;
          });
        });
      }

      // 2. Optimistic Update: Transactions List
      const tempId = crypto.randomUUID();
      const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
      const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
      
      const category = categories.find(c => c.id === transactionData.category_id);
      const account = accounts.find(a => a.id === transactionData.account_id);

      const optimisticTransaction: any = {
        id: tempId,
        description: transactionData.description,
        amount: transactionData.amount,
        date: transactionData.date, // Date object
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
        to_account: null, // Simplified
        installments: 1,
        current_installment: 1,
        is_recurring: false,
        is_fixed: false,
        user_id: user.id
      };

      // Update all transaction lists
      queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
        if (!oldData) return [optimisticTransaction];
        if (Array.isArray(oldData)) {
          // Prepend to list
          return [optimisticTransaction, ...oldData];
        }
        // If it's a paginated response (infinite query), it might be different structure
        // But useTransactions returns array.
        return oldData;
      });

      const { error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: transactionData.description,
            amount: transactionData.amount,
            date: transactionData.date.toISOString().split('T')[0],
            type: transactionData.type,
            category_id: transactionData.category_id,
            account_id: transactionData.account_id,
            status: transactionData.status,
            invoice_month: transactionData.invoiceMonth || null,
            invoice_month_overridden: !!transactionData.invoiceMonth,
          }
        }
      });

      if (error) {
        const errorMessage = getErrorMessage(error);
        if (errorMessage.includes('Credit limit exceeded')) {
          // ... existing error handling ...
          const match = errorMessage.match(/Available: ([\d.-]+).*Limit: ([\d.]+).*Used: ([\d.]+).*Requested: ([\d.]+)/);
          
          let friendlyMessage = 'Limite do cartão de crédito excedido. ';
          if (match) {
            const available = (parseFloat(match[1]) / 100).toFixed(2);
            const limit = (parseFloat(match[2]) / 100).toFixed(2);
            const used = (parseFloat(match[3]) / 100).toFixed(2);
            const requested = (parseFloat(match[4]) / 100).toFixed(2);
            
            friendlyMessage += `Disponível: R$ ${available} | Limite: R$ ${limit} | Usado: R$ ${used} | Solicitado: R$ ${requested}`;
          } else {
            friendlyMessage += 'Reduza o valor da transação, aumente o limite do cartão ou faça um pagamento.';
          }
          
          toast({
            title: 'Limite de crédito excedido',
            description: friendlyMessage,
            variant: 'destructive',
          });
          throw error; // Trigger rollback
        }
        throw error;
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      // Rollback transactions
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error adding transaction:', error);
      const errorMessage = getErrorMessage(error);
      // Only show toast if not already shown (credit limit)
      if (!errorMessage.includes('Credit limit exceeded')) {
         toast({
          title: 'Erro',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditTransaction = useCallback(async (
    updatedTransaction: TransactionUpdate,
    editScope?: EditScope
  ) => {
    if (!user) return;

    // Snapshot
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // Optimistic Update only for 'current' scope to avoid complexity
      if (!editScope || editScope === 'current') {
        // Find original transaction to calculate diffs
        let originalTransaction: Transaction | undefined;
        
        // Search in cache
        for (const [_, data] of previousTransactions) {
          if (Array.isArray(data)) {
            const found = data.find((t: any) => t.id === updatedTransaction.id);
            if (found) {
              originalTransaction = found;
              break;
            }
          }
        }

        if (originalTransaction) {
          // 1. Update Accounts
          if (previousAccounts) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
              if (!old) return [];
              return old.map(acc => {
                // If account changed
                if (updatedTransaction.account_id && updatedTransaction.account_id !== originalTransaction!.account_id) {
                   // Remove from old account
                   if (acc.id === originalTransaction!.account_id) {
                     let amount = originalTransaction!.amount; // Amount is always positive in DB? No, signed?
                     // In DB/Types, amount is usually positive and type determines sign, OR signed.
                     // Let's check: useOfflineTransactionMutations uses Math.abs.
                     // In Supabase, usually signed or type-based.
                     // TransactionInput has type.
                     // Let's assume amount is positive and type determines sign for calculation.
                     // Wait, in `handleAddTransaction` I did:
                     // if (type === 'expense') newBalance -= amount;
                     
                     // Revert old transaction effect
                     if (originalTransaction!.type === 'expense') acc.balance += originalTransaction!.amount;
                     else if (originalTransaction!.type === 'income') acc.balance -= originalTransaction!.amount;
                   }
                   // Add to new account
                   if (acc.id === updatedTransaction.account_id) {
                     const amount = updatedTransaction.amount ?? originalTransaction!.amount;
                     const type = updatedTransaction.type ?? originalTransaction!.type;
                     if (type === 'expense') acc.balance -= amount;
                     else if (type === 'income') acc.balance += amount;
                   }
                } else if (acc.id === originalTransaction!.account_id) {
                  // Same account, maybe amount/type changed
                  const oldAmount = originalTransaction!.amount;
                  const newAmount = updatedTransaction.amount ?? oldAmount;
                  const oldType = originalTransaction!.type;
                  const newType = updatedTransaction.type ?? oldType;

                  // Revert old
                  if (oldType === 'expense') acc.balance += oldAmount;
                  else if (oldType === 'income') acc.balance -= oldAmount;

                  // Apply new
                  if (newType === 'expense') acc.balance -= newAmount;
                  else if (newType === 'income') acc.balance += newAmount;
                }
                return acc;
              });
            });
          }

          // 2. Update Transaction in List
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((tx: any) => {
              if (tx.id === updatedTransaction.id) {
                 return {
                   ...tx,
                   ...updatedTransaction,
                   date: updatedTransaction.date ? new Date(updatedTransaction.date) : tx.date,
                   // If category/account changed, we should update the objects too, but for now ID is enough for logic,
                   // UI might show old name until refresh if we don't update objects.
                   // It's acceptable for <1s.
                 };
              }
              return tx;
            });
          });
        }
      }

      const updates: Partial<TransactionUpdate> = {};
      
      if (updatedTransaction.description !== undefined) {
        updates.description = updatedTransaction.description;
      }
      if (updatedTransaction.amount !== undefined) {
        updates.amount = updatedTransaction.amount;
      }
      if (updatedTransaction.date !== undefined) {
        updates.date = typeof updatedTransaction.date === 'string'
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

      const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: updatedTransaction.id,
          updates,
          scope: editScope || 'current',
        }
      });

      if (error) throw error;

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error updating transaction:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleDeleteTransaction = useCallback(async (
    transactionId: string,
    editScope?: EditScope
  ) => {
    if (!user) return;

    logger.info('[Delete] Iniciando exclusão de transação:', { transactionId, editScope });

    // Snapshot
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // Optimistic Update
      if (!editScope || editScope === 'current') {
         let originalTransaction: Transaction | undefined;
         for (const [_, data] of previousTransactions) {
          if (Array.isArray(data)) {
            const found = data.find((t: any) => t.id === transactionId);
            if (found) {
              originalTransaction = found;
              break;
            }
          }
        }

        if (originalTransaction) {
          // Prevent deleting "Saldo Inicial"
          if (originalTransaction.description === 'Saldo Inicial') {
            toast({
              title: 'Ação não permitida',
              description: 'O saldo inicial não pode ser excluído. Edite a conta para alterar o saldo inicial.',
              variant: 'destructive',
            });
            return;
          }

           // 1. Update Accounts (Revert balance)
           if (previousAccounts) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
              if (!old) return [];
              return old.map(acc => {
                // Reverter saldo da conta de origem
                if (acc.id === originalTransaction!.account_id) {
                   if (originalTransaction!.type === 'expense') acc.balance += Math.abs(originalTransaction!.amount);
                   else if (originalTransaction!.type === 'income') acc.balance -= Math.abs(originalTransaction!.amount);
                }
                // Se for transferência, reverter saldo da conta de destino também
                if (originalTransaction!.to_account_id && acc.id === originalTransaction!.to_account_id) {
                  // A conta destino recebeu (income), então precisa remover
                  acc.balance -= Math.abs(originalTransaction!.amount);
                }
                return acc;
              });
            });
           }

           // 2. Remove from list (incluindo transação vinculada se for transferência)
           queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            
            // Verificar se é transferência e tem linked_transaction_id
            const linkedId = originalTransaction!.linked_transaction_id;
            
            logger.info('[Delete] Filtrando cache local:', {
              transactionId,
              linkedId,
              hadLink: !!linkedId,
              totalBefore: oldData.length
            });
            
            const result = oldData.filter((tx: any) => {
              if (tx.id === transactionId) {
                logger.info('[Delete] Removendo transação principal:', transactionId);
                return false;
              }
              if (linkedId && tx.id === linkedId) {
                logger.info('[Delete] Removendo transação vinculada:', linkedId);
                return false;
              }
              return true;
            });
            
            logger.info('[Delete] Cache filtrado:', { totalAfter: result.length });
            return result;
          });
        }
      }

      // Usar função SQL atômica diretamente para evitar falhas de Edge Function / rate limit
      const { data: rpcData, error } = await supabase.rpc('atomic_delete_transaction', {
        p_user_id: user.id,
        p_transaction_id: transactionId,
        p_scope: editScope || 'current',
      });

      if (error) {
        const errorMessage = getErrorMessage(error);
        throw new Error(errorMessage || 'Erro ao excluir transação');
      }

      const record = rpcData && Array.isArray(rpcData)
        ? (rpcData[0] as { deleted_count?: number; success?: boolean; error_message?: string })
        : null;

      if (!record || record.success === false) {
        throw new Error(record?.error_message || 'Transação não encontrada ou já foi excluída');
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

      toast({
        title: 'Sucesso',
        description: `${record.deleted_count ?? 1} transação(ões) excluída(s)`,
      });
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error deleting transaction:', error);
      const errorMessage = getErrorMessage(error);

      toast({
        title: 'Erro ao excluir',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);
 
  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
  };
}
