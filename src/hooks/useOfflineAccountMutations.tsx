import { useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';
import { Account, Transaction } from '@/types';

// Interface para dados de criação de conta
interface AccountCreateData {
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
  balance?: number;
  color?: string;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
}

export function useOfflineAccountMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const processOfflineAdd = useCallback(async (accountData: AccountCreateData) => {
    try {
      const tempId = `temp-${Date.now()}`;
      const newAccount: Account = {
        id: tempId,
        user_id: user?.id || 'offline-user',
        name: accountData.name,
        type: accountData.type,
        balance: accountData.balance || 0,
        initial_balance: accountData.balance || 0,
        color: accountData.color || '#6b7280',
        limit_amount: accountData.limit_amount,
        due_date: accountData.due_date,
        closing_date: accountData.closing_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'add_account',
        data: { ...accountData, id: tempId }, // Include temp ID for mapping
      });

      // 2. Queue operation (Transaction) if balance != 0
      if (accountData.balance && accountData.balance !== 0) {
         const isIncome = accountData.balance > 0;
         const amount = Math.abs(accountData.balance);
         
         await offlineQueue.enqueue({
            type: 'transaction',
            data: {
                description: 'Saldo Inicial',
                amount: amount,
                date: new Date().toISOString().split('T')[0],
                type: isIncome ? 'income' : 'expense',
                account_id: tempId,
                status: 'completed',
                category_id: null
            }
         });
      }

      // 3. Update local DB (Optimistic UI)
      await offlineDatabase.saveAccounts([newAccount]);

      if (accountData.balance && accountData.balance !== 0) {
          const isIncome = accountData.balance > 0;
          const amount = Math.abs(accountData.balance);
          const txTempId = `temp-tx-${Date.now()}`;
          
          const optimisticTx = {
              id: txTempId,
              user_id: user?.id || 'offline-user',
              description: 'Saldo Inicial',
              amount: isIncome ? amount : -amount,
              date: new Date().toISOString().split('T')[0],
              type: isIncome ? 'income' : 'expense',
              category_id: null,
              account_id: tempId,
              status: 'completed',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
          };
          
          // Type assertion with proper validation
          await offlineDatabase.saveTransactions([optimisticTx as unknown as Transaction]);
          
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: unknown) => {
              if (!oldData) return [optimisticTx];
              if (Array.isArray(oldData)) {
                  return [optimisticTx, ...oldData];
              }
              return oldData;
          });
      }

      // 4. Update React Query Cache (Accounts)
      queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
        return [newAccount, ...(old || [])];
      });

      toast({
        title: 'Conta criada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account add queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account add:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a conta offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleAddAccount = useCallback(async (accountData: {
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment';
    balance?: number;
    color?: string;
    limit_amount?: number;
    due_date?: number;
    closing_date?: number;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // 1. Insert Account
        let newAccount;
        try {
          const { data, error } = await supabase
            .from('accounts')
            .insert({
              name: accountData.name,
              type: accountData.type,
              balance: accountData.balance || 0,
              initial_balance: accountData.balance || 0,
              color: accountData.color || '#6b7280',
              limit_amount: accountData.limit_amount,
              due_date: accountData.due_date,
              closing_date: accountData.closing_date,
              user_id: user.id,
            })
            .select()
            .single();
            
          if (error) throw error;
          newAccount = data;
        } catch (insertError: any) {
          // Fallback: If initial_balance column doesn't exist yet, try inserting without it
          if (insertError.message?.includes('initial_balance') || insertError.code === '42703') {
             logger.warn('Column initial_balance missing, falling back to legacy insert');
             const { data, error } = await supabase
              .from('accounts')
              .insert({
                name: accountData.name,
                type: accountData.type,
                balance: accountData.balance || 0,
                color: accountData.color || '#6b7280',
                limit_amount: accountData.limit_amount,
                due_date: accountData.due_date,
                closing_date: accountData.closing_date,
                user_id: user.id,
              })
              .select()
              .single();
              
             if (error) throw error;
             newAccount = data;
          } else {
            throw insertError;
          }
        }

        // 2. Create Initial Balance Transaction if needed
        if (accountData.balance && accountData.balance !== 0) {
           const isIncome = accountData.balance > 0;
           const amount = Math.abs(accountData.balance);
           
           const { error: txError } = await supabase.rpc('atomic_create_transaction', {
             p_user_id: user.id,
             p_description: 'Saldo Inicial',
             p_amount: amount,
             p_date: new Date().toISOString().split('T')[0],
             p_type: isIncome ? 'income' : 'expense',
             p_category_id: null,
             p_account_id: newAccount.id,
             p_status: 'completed'
           });
             
           if (txError) {
              logger.error('Failed to create initial balance transaction', txError);
              await supabase.from('accounts').delete().eq('id', newAccount.id);
              throw new Error('Falha ao criar transação de saldo inicial. Tente novamente.');
           }
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: 'Conta criada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account creation, falling back to offline mode');
          await processOfflineAdd(accountData);
          return;
        }

        logger.error('Error adding account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao criar conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineAdd(accountData);
  }, [isOnline, user, queryClient, toast, processOfflineAdd]);

  const processOfflineEdit = useCallback(async (accountId: string, accountData: any) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'edit_account',
        data: {
          account_id: accountId,
          updates: accountData,
        }
      });

      // Check if balance is being updated
      const newInitialBalance = accountData.initial_balance !== undefined ? accountData.initial_balance : accountData.balance;

      if (newInitialBalance !== undefined) {
          // Find the "Saldo Inicial" transaction for this account
          const transactions = await offlineDatabase.getTransactions(user?.id || '');
          const initialTx = transactions.find(t => t.account_id === accountId && t.description === 'Saldo Inicial');
          
          const isIncome = newInitialBalance > 0;
          const amount = Math.abs(newInitialBalance);
          const txUpdates = {
              amount: amount,
              type: isIncome ? 'income' : 'expense',
          };

          if (initialTx) {
              // Queue update for existing transaction
              await offlineQueue.enqueue({
                  type: 'edit',
                  data: {
                      id: initialTx.id,
                      updates: txUpdates
                  }
              });
              
              // Update local DB for transaction
              const updatedTx = { ...initialTx, ...txUpdates, updated_at: new Date().toISOString() };
              await offlineDatabase.saveTransactions([updatedTx as unknown as Transaction]);
              
              // Update React Query Cache for transactions
              queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
                  if (!oldData) return oldData;
                  if (Array.isArray(oldData)) {
                      return oldData.map((t: any) => t.id === initialTx.id ? updatedTx : t);
                  }
                  return oldData;
              });

          } else if (newInitialBalance !== 0) {
              // Create new transaction if it doesn't exist
              const txTempId = `temp-tx-${Date.now()}`;
              const newTx = {
                  id: txTempId,
                  user_id: user?.id || 'offline-user',
                  description: 'Saldo Inicial',
                  amount: isIncome ? amount : -amount,
                  date: new Date().toISOString().split('T')[0],
                  type: isIncome ? 'income' : 'expense',
                  category_id: null,
                  account_id: accountId,
                  status: 'completed',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
              };

              await offlineQueue.enqueue({
                  type: 'transaction',
                  data: {
                      description: 'Saldo Inicial',
                      amount: amount,
                      date: new Date().toISOString().split('T')[0],
                      type: isIncome ? 'income' : 'expense',
                      account_id: accountId,
                      status: 'completed',
                      category_id: null
                  }
              });

              await offlineDatabase.saveTransactions([newTx as any]);
              
              queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
                  if (!oldData) return [newTx];
                  if (Array.isArray(oldData)) {
                      return [newTx, ...oldData];
                  }
                  return oldData;
              });
          }
      }

      // 2. Update local DB (Optimistic UI)
      const existingAccounts = await offlineDatabase.getAccounts(user?.id || '');
      const accountToUpdate = existingAccounts.find(a => a.id === accountId);
      
      if (accountToUpdate) {
        const updatedAccount = { ...accountToUpdate, ...accountData, updated_at: new Date().toISOString() };
        await offlineDatabase.saveAccounts([updatedAccount]);

        // 3. Update React Query Cache
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return old;
          return old.map(acc => acc.id === accountId ? updatedAccount : acc);
        });
      }

      toast({
        title: 'Edição registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditAccount = useCallback(async (accountId: string, accountData: {
    name?: string;
    type?: 'checking' | 'savings' | 'credit' | 'investment';
    balance?: number;
    initial_balance?: number;
    color?: string;
    limit_amount?: number;
    due_date?: number;
    closing_date?: number;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // Separate balance update from other updates
        const { balance, initial_balance, ...otherUpdates } = accountData;
        
        // Use initial_balance if provided, otherwise fallback to balance (legacy)
        const newInitialBalance = initial_balance !== undefined ? initial_balance : balance;

        // 1. Update Account properties
        const updatesToSave: any = { ...otherUpdates };
        if (newInitialBalance !== undefined) {
            updatesToSave.initial_balance = newInitialBalance;
        }

        if (Object.keys(updatesToSave).length > 0) {
            try {
              const { error } = await supabase
                .from('accounts')
                .update(updatesToSave)
                .eq('id', accountId)
                .eq('user_id', user.id);

              if (error) throw error;
            } catch (updateError: any) {
               // Fallback: If initial_balance column doesn't exist yet, try updating without it
               if ((updateError.message?.includes('initial_balance') || updateError.code === '42703') && updatesToSave.initial_balance !== undefined) {
                  logger.warn('Column initial_balance missing, falling back to legacy update');
                  delete updatesToSave.initial_balance;
                  
                  if (Object.keys(updatesToSave).length > 0) {
                    const { error } = await supabase
                      .from('accounts')
                      .update(updatesToSave)
                      .eq('id', accountId)
                      .eq('user_id', user.id);
                      
                    if (error) throw error;
                  }
               } else {
                 throw updateError;
               }
            }
        }

        // 2. Handle Balance Update via Transaction (Saldo Inicial)
        if (newInitialBalance !== undefined) {
            const { data: txs } = await supabase
                .from('transactions')
                .select('id')
                .eq('account_id', accountId)
                .eq('description', 'Saldo Inicial')
                .limit(1);
            
            const isIncome = newInitialBalance > 0;
            const amount = Math.abs(newInitialBalance);
            const txData = {
                amount: amount,
                type: isIncome ? 'income' : 'expense',
            };

            if (txs && txs.length > 0) {
                const { error: txError } = await supabase
                    .from('transactions')
                    .update(txData as any)
                    .eq('id', txs[0].id);
                if (txError) logger.error('Failed to update initial balance transaction', txError);
            } else if (newInitialBalance !== 0) {
                const { error: txError } = await supabase.rpc('atomic_create_transaction', {
                    p_user_id: user.id,
                    p_description: 'Saldo Inicial',
                    p_amount: amount,
                    p_date: new Date().toISOString().split('T')[0],
                    p_type: isIncome ? 'income' : 'expense',
                    p_category_id: null,
                    p_account_id: accountId,
                    p_status: 'completed'
                });

                if (txError) {
                    logger.error('Failed to create initial balance transaction', txError);
                    toast({
                        title: 'Aviso',
                        description: 'Saldo atualizado, mas houve erro ao registrar a transação de histórico.',
                        variant: 'default'
                    });
                }
            }
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        toast({
          title: 'Sucesso',
          description: 'Conta atualizada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account update, falling back to offline mode');
          await processOfflineEdit(accountId, accountData);
          return;
        }

        logger.error('Error updating account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao atualizar conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineEdit(accountId, accountData);
  }, [isOnline, user, queryClient, toast, processOfflineEdit]);

  const processOfflineDelete = useCallback(async (accountId: string) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'delete_account',
        data: {
          account_id: accountId,
        }
      });

      // 2. Update React Query Cache (Optimistic UI)
      queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
        if (!old) return old;
        return old.filter(acc => acc.id !== accountId);
      });

      toast({
        title: 'Exclusão registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [queryClient, toast]);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('accounts')
          .delete()
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: 'Conta excluída com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account deletion, falling back to offline mode');
          await processOfflineDelete(accountId);
          return;
        }

        logger.error('Error deleting account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao excluir conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineDelete(accountId);
  }, [isOnline, user, queryClient, toast, processOfflineDelete]);

  const handleImportAccounts = useCallback(async (accountsData: any[], accountsToReplace: string[] = []) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // Deletar contas que serão substituídas
        if (accountsToReplace.length > 0) {
          const { error: deleteError } = await supabase
            .from('accounts')
            .delete()
            .in('id', accountsToReplace)
            .eq('user_id', user.id);

          if (deleteError) throw deleteError;
        }

        // Inserir novas contas
        const accountsToAdd = accountsData.map(acc => ({
          name: acc.name,
          type: acc.type,
          balance: acc.balance || 0,
          color: acc.color || '#6b7280',
          limit_amount: acc.limit_amount,
          due_date: acc.due_date,
          closing_date: acc.closing_date,
          user_id: user.id,
        }));

        const { data: createdAccounts, error } = await supabase
          .from('accounts')
          .insert(accountsToAdd)
          .select();

        if (error) throw error;

        // Create Initial Balance Transactions for imported accounts
        if (createdAccounts && createdAccounts.length > 0) {
            const initialBalanceTransactions = createdAccounts
                .filter(acc => acc.balance !== 0)
                .map(acc => {
                    const isIncome = acc.balance > 0;
                    const amount = Math.abs(acc.balance);
                    return {
                        user_id: user.id,
                        description: 'Saldo Inicial',
                        amount: isIncome ? amount : -amount,
                        date: new Date().toISOString().split('T')[0],
                        type: isIncome ? 'income' : 'expense',
                        account_id: acc.id,
                        status: 'completed',
                        category_id: null
                    };
                });
            
            if (initialBalanceTransactions.length > 0) {
                const { error: txError } = await supabase
                    .from('transactions')
                    .insert(initialBalanceTransactions as any);
                
                if (txError) {
                    logger.error('Failed to create initial balance transactions for imported accounts', txError);
                }
            }
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: `${accountsToAdd.length} contas importadas com sucesso`,
        });
      } catch (error: unknown) {
        logger.error('Error importing accounts:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao importar contas',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue import accounts operation
    try {
      await offlineQueue.enqueue({
        type: 'import_accounts',
        data: {
          accounts: accountsData,
          replace_ids: accountsToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Accounts import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue accounts import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  return {
    handleAddAccount,
    handleEditAccount,
    handleDeleteAccount,
    handleImportAccounts,
  };
}
