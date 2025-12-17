import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { Account, ImportAccountData } from '@/types';
import { logger } from '@/lib/logger';
import { importAccountSchema } from '@/lib/validationSchemas';
import { offlineQueue } from '@/lib/offlineQueue';
import { z } from 'zod';
import { getErrorMessage } from '@/types/errors';

export function useAccountHandlers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { invalidateTransactions, invalidateAccounts } = useQueryInvalidation();
  const isOnline = useOnlineStatus();

  const handleEditAccount = useCallback(async (updatedAccount: Partial<Account> & { id: string }) => {
    if (!user) return;
    try {
      const { initial_balance: _initialBalance, ...dbUpdates } = updatedAccount;
      
      const { error: updateError } = await supabase
        .from('accounts')
        .update(dbUpdates as any)
        .eq('id', updatedAccount.id)
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      const newInitialBalance = (updatedAccount as any).initial_balance;
      if (newInitialBalance !== undefined) {
        const { data: initialTxs, error: fetchError } = await supabase
          .from('transactions')
          .select('id, amount, type')
          .eq('account_id', updatedAccount.id)
          .eq('description', 'Saldo Inicial')
          .order('created_at', { ascending: true });

        if (fetchError) logger.error('Error fetching initial balance transaction', fetchError);

        if (initialTxs && initialTxs.length > 0) {
          if (initialTxs.length > 1) {
            const duplicateIds = initialTxs.slice(1).map(tx => tx.id);
            const { error: cleanupError } = await supabase.from('transactions').delete().in('id', duplicateIds);
            if (cleanupError) logger.error('Error cleaning up duplicate initial balance transactions', cleanupError);
          }
          if (newInitialBalance === 0) {
            const { error: deleteError } = await supabase.from('transactions').delete().eq('id', initialTxs[0].id);
            if (deleteError) logger.error('Error deleting zero initial balance transaction', deleteError);
          } else {
            const { error: updateTxError } = await supabase.from('transactions').update({ amount: newInitialBalance, type: newInitialBalance >= 0 ? 'income' : 'expense' }).eq('id', initialTxs[0].id);
            if (updateTxError) logger.error('Error updating initial balance transaction', updateTxError);
          }
        } else if (newInitialBalance !== 0) {
          const { error: createError } = await supabase.from('transactions').insert({ user_id: user.id, description: 'Saldo Inicial', amount: newInitialBalance, date: new Date().toISOString().split('T')[0], type: newInitialBalance >= 0 ? 'income' : 'expense', account_id: updatedAccount.id, status: 'completed', category_id: null });
          if (createError) logger.error('Error creating initial balance transaction', createError);
        }
      }

      const { error: recalcError } = await supabase.rpc('recalculate_account_balance', { p_account_id: updatedAccount.id });
      if (recalcError) logger.error('Error recalculating account balance', recalcError);

      await new Promise(resolve => setTimeout(resolve, 100));

      await invalidateTransactions();
      await invalidateAccounts();
    } catch (error: unknown) {
      logger.error('Error updating account:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao atualizar conta',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, invalidateTransactions, invalidateAccounts, toast]);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (!user) return;
    try {
      const { data: transactions, error: checkError } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', accountId).limit(1);
      if (checkError) throw checkError;
      if (transactions && transactions.length > 0) {
        toast({ title: 'Não é possível excluir', description: 'Esta conta possui transações vinculadas. Exclua as transações primeiro ou transfira-as para outra conta.', variant: 'destructive' });
        return;
      }
      const { data: transfers, error: transferCheckError } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('to_account_id', accountId).limit(1);
      if (transferCheckError) throw transferCheckError;
      if (transfers && transfers.length > 0) {
        toast({ title: 'Não é possível excluir', description: 'Esta conta é destino de transferências. Exclua as transferências primeiro.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('accounts').delete().eq('id', accountId).eq('user_id', user.id);
      if (error) throw error;
      await invalidateAccounts();
      toast({ title: 'Sucesso', description: 'Conta excluída com sucesso' });
    } catch (error: unknown) {
      logger.error('Error deleting account:', error);
      toast({ title: 'Erro', description: getErrorMessage(error) || 'Erro ao excluir conta', variant: 'destructive' });
      throw error;
    }
  }, [user, toast, invalidateAccounts]);

  const handleImportAccounts = useCallback(async (accountsData: ImportAccountData[], accountsToReplace: string[] = []) => {
    if (isOnline) {
      if (!user) return;
      try {
        const validatedAccounts: ImportAccountData[] = [];
        const validationErrors: string[] = [];
        for (let i = 0; i < accountsData.length; i++) {
          const result = importAccountSchema.safeParse(accountsData[i]);
          if (!result.success) {
            const errorMessages = result.error.errors.map((e: z.ZodIssue) => e.message).join(', ');
            validationErrors.push(`Linha ${i + 1}: ${errorMessages}`);
          } else {
            validatedAccounts.push(result.data);
          }
        }
        if (validationErrors.length > 0) {
          toast({ title: 'Erro de validação', description: validationErrors.slice(0, 3).join('; ') + (validationErrors.length > 3 ? `... e mais ${validationErrors.length - 3} erros` : ''), variant: 'destructive' });
          throw new Error('Dados inválidos na importação');
        }
        if (accountsToReplace.length > 0) {
          const { error: deleteError } = await supabase.from('accounts').delete().in('id', accountsToReplace).eq('user_id', user.id);
          if (deleteError) throw deleteError;
        }
        const accountsToAdd = validatedAccounts.map(acc => ({ name: acc.name, type: acc.type, balance: acc.balance || 0, color: acc.color || '#6b7280', limit_amount: acc.limit_amount, due_date: acc.due_date, closing_date: acc.closing_date, user_id: user.id }));
        const { data: createdAccounts, error } = await supabase.from('accounts').insert(accountsToAdd).select();
        if (error) throw error;
        if (createdAccounts && createdAccounts.length > 0) {
            const initialBalanceTransactions = createdAccounts.filter(acc => acc.balance !== 0).map(acc => {
                const isIncome = acc.balance > 0;
                const amount = acc.balance;
                return { user_id: user.id, description: 'Saldo Inicial', amount, date: new Date().toISOString().split('T')[0], type: isIncome ? 'income' : 'expense', account_id: acc.id, status: 'completed', category_id: null };
            });
            if (initialBalanceTransactions.length > 0) {
                const { error: txError } = await supabase.from('transactions').insert(initialBalanceTransactions as any);
                if (txError) {
                    toast({ title: 'Aviso', description: 'Contas importadas, mas houve erro ao registrar o histórico de saldo inicial.', variant: 'default' });
                }
            }
        }
        await invalidateAccounts();
        toast({ title: 'Sucesso', description: `${accountsToAdd.length} contas importadas${accountsToReplace.length > 0 ? ` (${accountsToReplace.length} substituídas)` : ''} com sucesso!` });
      } catch (error: unknown) {
        if (getErrorMessage(error) !== 'Dados inválidos na importação') {
          toast({ title: 'Erro', description: getErrorMessage(error) || 'Erro ao importar contas.', variant: 'destructive' });
        }
        throw error;
      }
      return;
    }
    try {
      await offlineQueue.enqueue({ type: 'import_accounts', data: { accounts: accountsData, replace_ids: accountsToReplace } });
      toast({ title: 'Importação registrada', description: 'Será sincronizada quando você voltar online.', duration: 3000 });
      await invalidateAccounts();
    } catch (error) {
      logger.error('Failed to queue accounts import:', error);
      toast({ title: 'Erro', description: 'Não foi possível registrar a importação offline.', variant: 'destructive' });
      throw error;
    }
  }, [isOnline, user, invalidateAccounts, toast]);

  return {
    handleEditAccount,
    handleDeleteAccount,
    handleImportAccounts,
  };
}