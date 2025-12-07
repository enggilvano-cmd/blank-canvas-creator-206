import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '../queries/useAccounts';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

export function useTransferMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { accounts } = useAccounts();

  const handleTransfer = useCallback(async (
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    date: Date
  ) => {
    if (!user) throw new Error('Usuário não autenticado');

    try {
      const fromAccount = accounts.find((acc) => acc.id === fromAccountId);
      const toAccount = accounts.find((acc) => acc.id === toAccountId);
      if (!fromAccount || !toAccount) throw new Error('Contas não encontradas');

      const { error } = await supabase.functions.invoke('atomic-transfer', {
        body: {
          transfer: {
            from_account_id: fromAccountId,
            to_account_id: toAccountId,
            amount: amount,
            date: date.toISOString().split('T')[0],
            outgoing_description: `Transferência para ${toAccount.name}`,
            incoming_description: `Transferência de ${fromAccount.name}`,
            status: 'completed' as const,
          }
        }
      });

      if (error) throw error;

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

      // Retornar as contas envolvidas na transferência
      return { fromAccount, toAccount };
    } catch (error: unknown) {
      logger.error('Error processing transfer:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro na transferência',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, accounts, queryClient, toast]);

  return {
    handleTransfer,
  };
}
