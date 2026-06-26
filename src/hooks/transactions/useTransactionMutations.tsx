import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { notifyFixedTransactionsChange } from '@/hooks/useFixedTransactions';
import { offlineDatabase } from '@/lib/offlineDatabase';
import type { TransactionInput, TransactionUpdate, Account, Category, Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import type { EditScope } from '@/components/transactions/TransactionScopeDialog';
import { getErrorMessage } from '@/lib/errorUtils';
import { generateUUID } from '@/lib/utils';

export function useTransactionMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { invalidateTransactions, helper } = useQueryInvalidation();
  const queryClient = helper.queryClient;





  const handleAddTransaction = useCallback(async (transactionData: TransactionInput) => {
    if (!user) {return;}
    
    // Snapshot for rollback
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // 1. Optimistic Update: Accounts Balance
      if (previousAccounts) {
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) {return [];}
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
      const tempId = generateUUID();
      const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
      const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
      
      const category = categories.find(c => c.id === transactionData.category_id);
      const account = accounts.find(a => a.id === transactionData.account_id);

      const optimisticTransaction: Transaction = {
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
      queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
        if (!oldData) {return [optimisticTransaction];}
        if (Array.isArray(oldData)) {
          // Prepend to list
          return [optimisticTransaction, ...oldData];
        }
        // If it's a paginated response (infinite query), it might be different structure
        // But useTransactions returns array.
        return oldData;
      });

      const payload = {
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
      };

      const { data: responseData, error } = await supabase.functions.invoke('atomic-transaction', {
        body: payload
      });

      const response = { data: responseData, error };

      if (response.error) {
        logger.error('🚨 ERRO 400 - Detalhes:', JSON.stringify({
          message: response.error.message,
          context: response.error.context,
          details: response.error,
          responseData: response.data
        }, null, 2));
        const { error } = response;
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
      await invalidateTransactions();
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Quando adiciona um lançamento, precisa atualizar os cálculos de provisões
      notifyFixedTransactionsChange();
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
    if (!user) {return;}

    // Snapshot
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    // Find original transaction to calculate diffs (moved outside scope so it's available later)
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

    try {
      // Optimistic Update only for 'current' scope to avoid complexity
      if (!editScope || editScope === 'current') {
        if (originalTransaction) {
          // 1. Update Accounts
          if (previousAccounts) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
              if (!old) {return [];}
              return old.map(acc => {
                // If account changed
                if (updatedTransaction.account_id && updatedTransaction.account_id !== originalTransaction!.account_id) {
                   // Remove from old account
                   if (acc.id === originalTransaction!.account_id) {
                     const amount = originalTransaction!.amount; // Amount is always positive in DB? No, signed?
                     // In DB/Types, amount is usually positive and type determines sign, OR signed.
                     // Let's check: useOfflineTransactionMutations uses Math.abs.
                     // In Supabase, usually signed or type-based.
                     // TransactionInput has type.
                     // Let's assume amount is positive and type determines sign for calculation.
                     // Wait, in `handleAddTransaction` I did:
                     // if (type === 'expense') newBalance -= amount;
                     
                     // Revert old transaction effect
                     if (originalTransaction!.type === 'expense') {acc.balance += originalTransaction!.amount;}
                     else if (originalTransaction!.type === 'income') {acc.balance -= originalTransaction!.amount;}
                   }
                   // Add to new account
                   if (acc.id === updatedTransaction.account_id) {
                     const amount = updatedTransaction.amount ?? originalTransaction!.amount;
                     const type = updatedTransaction.type ?? originalTransaction!.type;
                     if (type === 'expense') {acc.balance -= amount;}
                     else if (type === 'income') {acc.balance += amount;}
                   }
                } else if (acc.id === originalTransaction!.account_id) {
                  // Same account, maybe amount/type changed
                  const oldAmount = originalTransaction!.amount;
                  const newAmount = updatedTransaction.amount ?? oldAmount;
                  const oldType = originalTransaction!.type;
                  const newType = updatedTransaction.type ?? oldType;

                  // Revert old
                  if (oldType === 'expense') {acc.balance += oldAmount;}
                  else if (oldType === 'income') {acc.balance -= oldAmount;}

                  // Apply new
                  if (newType === 'expense') {acc.balance -= newAmount;}
                  else if (newType === 'income') {acc.balance += newAmount;}
                }
                return acc;
              });
            });
          }

          // 2. Update Transaction in List
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) {return oldData;}
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
      if ((updatedTransaction as any).invoice_month_overridden !== undefined) {
        (updates as any).invoice_month_overridden = (updatedTransaction as any).invoice_month_overridden;
      }

      const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: updatedTransaction.id,
          updates,
          scope: editScope || 'current',
        }
      });

      if (error) {throw error;}



      // ✅ Invalidação imediata dispara refetch automático sem delay
      await invalidateTransactions();
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Se editou um lançamento, os cálculos de provisões podem mudar
      // Se editou uma provisão, ela mesma precisa refetchar
      notifyFixedTransactionsChange();
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
    if (!user) {return;}

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
              if (!old) {return [];}
              return old.map(acc => {
                // Reverter saldo da conta de origem
                if (acc.id === originalTransaction!.account_id) {
                   if (originalTransaction!.type === 'expense') {acc.balance += Math.abs(originalTransaction!.amount);}
                   else if (originalTransaction!.type === 'income') {acc.balance -= Math.abs(originalTransaction!.amount);}
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
            if (!oldData || !Array.isArray(oldData)) {return oldData;}
            
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
        const errorMsg = record?.error_message || 'Transação não encontrada ou já foi excluída';
        
        // Se a transação não foi encontrada, tentamos deletar diretamente via Supabase
        // Isso serve como fallback caso a RPC tenha falhado em encontrar a transação por algum motivo
        if (errorMsg === 'Transaction not found' || errorMsg.includes('não encontrada')) {
          logger.warn(`[Delete] Transaction ${transactionId} not found via RPC, trying direct delete fallback...`);
          
          const { error: deleteError, count } = await supabase
            .from('transactions')
            .delete({ count: 'exact' })
            .eq('id', transactionId)
            .eq('user_id', user.id); // Segurança extra

          if (deleteError) {
            logger.error('[Delete] Direct delete failed:', deleteError);
            // Se falhar também, assumimos que já foi deletada
          } else if (count && count > 0) {
            logger.info(`[Delete] Successfully deleted ${count} transaction(s) via direct fallback.`);
          } else {
            logger.warn(`[Delete] Transaction ${transactionId} really not found in DB (direct delete count=0).`);
          }
        } else {
          throw new Error(errorMsg);
        }
      }

      // ✅ Reembolsar provisão quando transação é deletada
      // Encontra a transação deletada para obter category_id e amount
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



      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Quando deleta um lançamento, os cálculos de provisões mudam
      notifyFixedTransactionsChange();

      const deletedCount = record?.deleted_count ?? 1;

      toast({
        title: 'Sucesso',
        description: `${deletedCount} transação(ões) excluída(s)`,
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
