import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Account, ImportAccountData } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { importAccountSchema } from '@/lib/validationSchemas';
import { offlineQueue } from '@/lib/offlineQueue';
import { z } from 'zod';
import { getErrorMessage } from '@/types/errors';

export function useAccountHandlers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const handleEditAccount = useCallback(async (updatedAccount: Partial<Account> & { id: string }) => {
    if (!user) return;
    try {
      // Remove initial_balance from updates as it doesn't exist in the DB
      const { initial_balance: _initialBalance, ...dbUpdates } = updatedAccount as Partial<Account> & { id: string; initial_balance?: number };
      
      // 1. Atualizar a conta com as novas informações
      const { error: updateError } = await supabase
        .from('accounts')
        .update(dbUpdates as any)
        .eq('id', updatedAccount.id)
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      // 2. Se o saldo inicial foi alterado, garantir que o saldo total seja recalculado
      const newInitialBalance = (updatedAccount as Partial<Account> & { initial_balance?: number }).initial_balance;
      if (newInitialBalance !== undefined) {
        // Buscar TODAS as transações de "Saldo Inicial" (para detectar duplicatas)
        const { data: initialTxs, error: fetchError } = await supabase
          .from('transactions')
          .select('id, amount, type')
          .eq('account_id', updatedAccount.id)
          .eq('description', 'Saldo Inicial')
          .order('created_at', { ascending: true });

        if (fetchError) {
          logger.error('Error fetching initial balance transaction', fetchError);
        }

        if (initialTxs && initialTxs.length > 0) {
          // Se houver múltiplas transações de Saldo Inicial (bug/duplicata), deletar todas exceto a primeira
          if (initialTxs.length > 1) {
            logger.warn(`Found ${initialTxs.length} "Saldo Inicial" transactions for account ${updatedAccount.id}. Cleaning up duplicates...`);
            const duplicateIds = initialTxs.slice(1).map(tx => tx.id);
            const { error: cleanupError } = await supabase
              .from('transactions')
              .delete()
              .in('id', duplicateIds);
            if (cleanupError) logger.error('Error cleaning up duplicate initial balance transactions', cleanupError);
          }

          // Atualizar a primeira transação existente
          if (newInitialBalance === 0) {
            // Se o novo saldo é zero, deletar a transação
            const { error: deleteError } = await supabase
              .from('transactions')
              .delete()
              .eq('id', initialTxs[0].id);
            if (deleteError) logger.error('Error deleting zero initial balance transaction', deleteError);
          } else {
            // Atualizar a transação com o novo valor
            // O amount já deve conter o sinal (positivo ou negativo)
            const { error: updateTxError } = await supabase
              .from('transactions')
              .update({
                amount: newInitialBalance,
                type: newInitialBalance >= 0 ? 'income' : 'expense',
              })
              .eq('id', initialTxs[0].id);
            if (updateTxError) logger.error('Error updating initial balance transaction', updateTxError);
          }
        } else if (newInitialBalance !== 0) {
          // Criar uma nova transação de "Saldo Inicial" se não existir e o saldo não for zero
          const { error: createError } = await supabase
            .from('transactions')
            .insert({
              user_id: user.id,
              description: 'Saldo Inicial',
              amount: newInitialBalance, // Armazenar com sinal
              date: new Date().toISOString().split('T')[0],
              type: newInitialBalance >= 0 ? 'income' : 'expense',
              account_id: updatedAccount.id,
              status: 'completed',
              category_id: null,
            });
          if (createError) logger.error('Error creating initial balance transaction', createError);
        }
      }

      // 3. Chamar a função de recálculo para garantir que o saldo final está correto
      const { error: recalcError } = await supabase.rpc('recalculate_account_balance', {
        p_account_id: updatedAccount.id
      });

      if (recalcError) {
        logger.error('Error recalculating account balance', recalcError);
      }

      // 4. Aguardar um pequeno delay para garantir que o banco de dados processou tudo
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Invalidar o cache APÓS todas as operações
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      
      toast({
        title: 'Sucesso',
        description: 'Conta atualizada com sucesso',
      });
    } catch (error: unknown) {
      logger.error('Error updating account:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao atualizar conta',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (!user) return;
    try {
      // CRITICAL: Verificar se há transações vinculadas antes de deletar
      const { data: transactions, error: checkError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .limit(1);

      if (checkError) throw checkError;

      // Se há transações, bloquear exclusão
      if (transactions && transactions.length > 0) {
        toast({
          title: 'Não é possível excluir',
          description: 'Esta conta possui transações vinculadas. Exclua as transações primeiro ou transfira-as para outra conta.',
          variant: 'destructive',
        });
        return;
      }

      // Verificar se é conta destino em transferências
      const { data: transfers, error: transferCheckError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('to_account_id', accountId)
        .limit(1);

      if (transferCheckError) throw transferCheckError;

      if (transfers && transfers.length > 0) {
        toast({
          title: 'Não é possível excluir',
          description: 'Esta conta é destino de transferências. Exclua as transferências primeiro.',
          variant: 'destructive',
        });
        return;
      }

      // Se passou nas verificações, pode deletar
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
      logger.error('Error deleting account:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao excluir conta',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, toast, queryClient]);

  const handleImportAccounts = useCallback(async (
    accountsData: ImportAccountData[],
    accountsToReplace: string[] = []
  ) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        logger.debug('[ImportAccounts] handleImportAccounts chamado (ONLINE)', {
          totalAccounts: accountsData.length,
          accountsToReplace: accountsToReplace.length,
          firstAccountSample: accountsData[0]
        });

        // 1. Validar cada conta usando Zod schema
        const validatedAccounts: ImportAccountData[] = [];
        const validationErrors: string[] = [];

        for (let i = 0; i < accountsData.length; i++) {
          const result = importAccountSchema.safeParse(accountsData[i]);
          if (!result.success) {
            logger.error(`[ImportAccounts] Validação falhou na linha ${i + 1}:`, {
              data: accountsData[i],
              errors: result.error.errors
            });
            validationErrors.push(
              `Linha ${i + 1}: ${result.error.errors.map((e: z.ZodIssue) => e.message).join(', ')}`
            );
          } else {
            validatedAccounts.push(result.data);
          }
        }

        if (validationErrors.length > 0) {
          logger.error('[ImportAccounts] Erros de validação encontrados:', {
            totalErrors: validationErrors.length,
            errors: validationErrors
          });
          toast({
            title: 'Erro de validação',
            description: validationErrors.slice(0, 3).join('; ') + 
                        (validationErrors.length > 3 ? `... e mais ${validationErrors.length - 3} erros` : ''),
            variant: 'destructive',
          });
          throw new Error('Dados inválidos na importação');
        }

        logger.debug('[ImportAccounts] Todas as contas validadas com sucesso:', {
          validatedCount: validatedAccounts.length
        });

        // 2. Deletar contas que serão substituídas
        if (accountsToReplace.length > 0) {
          const { error: deleteError } = await supabase
            .from('accounts')
            .delete()
            .in('id', accountsToReplace)
            .eq('user_id', user.id);
          
          if (deleteError) throw deleteError;
        }

        // 3. Inserir novas contas validadas
        const accountsToAdd = validatedAccounts.map(acc => ({
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

        // 4. Criar transações de Saldo Inicial para contas com saldo != 0
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
                    toast({
                        title: 'Aviso',
                        description: 'Contas importadas, mas houve erro ao registrar o histórico de saldo inicial.',
                        variant: 'default'
                    });
                }
            }
        }
        
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: `${accountsToAdd.length} contas importadas${accountsToReplace.length > 0 ? ` (${accountsToReplace.length} substituídas)` : ''} com sucesso!`,
        });
      } catch (error: unknown) {
        logger.error('Error importing accounts:', error);
        const errorMsg = getErrorMessage(error);
        if (errorMsg !== 'Dados inválidos na importação') {
          toast({
            title: 'Erro',
            description: errorMsg || 'Erro ao importar contas.',
            variant: 'destructive'
          });
        }
        throw error;
      }
      return;
    }

    // Offline: enqueue import accounts operation
    try {
      logger.debug('[ImportAccounts] Enfileirando importação OFFLINE', {
        totalAccounts: accountsData.length,
        accountsToReplace: accountsToReplace.length
      });

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
      
      // Invalidate cache para atualizar a UI imediatamente com dados temporários
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
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
    handleEditAccount,
    handleDeleteAccount,
    handleImportAccounts,
  };
}
