import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Account } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { offlineSync } from '@/lib/offlineSync';

export function useAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const query = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async () => {
      if (!user) return [];
      
      // Estratégia Offline-First
      if (!isOnline) {
        const localAccounts = await offlineDatabase.getAccounts(user.id);
        return localAccounts.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      }

      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type, balance, initial_balance, limit_amount, due_date, closing_date, color, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const accounts = (data || []).map((acc) => ({
        ...acc,
        limit: acc.limit_amount,
      })) as Account[];

      // Atualizar cache local em background
      offlineDatabase.saveAccounts(accounts).catch(err => 
        logger.error('Failed to update local accounts cache:', err)
      );

      return accounts;
    },
    enabled: !!user,
    // Otimização: dados de contas são relatively stable após mutações
    // staleTime moderado evita refetches desnecessários ao navegar entre páginas
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 10 * 60 * 1000, // 10 minutos
    // Keep previous data while fetching
    placeholderData: (previousData) => previousData,
    // Refetch only when data is stale (não forçar sempre)
    refetchOnMount: true, // Default behavior: refetch se stale
    refetchOnWindowFocus: true, // Sincronizar ao voltar para janela
  });

  const updateMutation = useMutation({
    mutationFn: async (updatedAccount: Partial<Account> & { id: string }) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('accounts')
        .update(updatedAccount)
        .eq('id', updatedAccount.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return updatedAccount;
    },
    onMutate: async (updatedAccount) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.accounts });
      const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);

      if (previousAccounts) {
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return [];
          return old.map(acc => acc.id === updatedAccount.id ? { ...acc, ...updatedAccount } : acc);
        });
      }

      return { previousAccounts };
    },
    onError: (err, newAccount, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, context.previousAccounts);
      }
      logger.error('Error updating account:', err);
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      if (variables.balance !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountId)
        .eq('user_id', user.id);

      if (error) throw error;
      return accountId;
    },
    onMutate: async (accountId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.accounts });
      const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);

      if (previousAccounts) {
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return [];
          return old.filter(acc => acc.id !== accountId);
        });
      }

      return { previousAccounts };
    },
    onError: (err, accountId, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, context.previousAccounts);
      }
      logger.error('Error deleting account:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (accountsData: Array<Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('User not authenticated');

      const accountsToAdd = accountsData.map(acc => ({
        name: acc.name,
        type: acc.type,
        balance: acc.balance || 0,
        color: acc.color,
        limit_amount: acc.limit_amount,
        due_date: acc.due_date,
        closing_date: acc.closing_date,
        user_id: user.id,
      }));

      const { error } = await supabase
        .from('accounts')
        .insert(accountsToAdd);

      if (error) throw error;
      return accountsToAdd;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });

  return {
    accounts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateAccount: updateMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
    importAccounts: importMutation.mutateAsync,
  };
}
