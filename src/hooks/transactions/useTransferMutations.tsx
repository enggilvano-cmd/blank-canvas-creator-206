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

      // Chamada direta RPC para evitar problemas com Edge Function
      const { data, error } = await supabase.rpc('atomic_create_transfer', {
        p_user_id: user.id,
        p_from_account_id: fromAccountId,
        p_to_account_id: toAccountId,
        p_amount: amount,
        p_date: date.toISOString().split('T')[0],
        p_outgoing_description: `Transferência para ${toAccount.name}`,
        p_incoming_description: `Transferência de ${fromAccount.name}`,
        p_status: 'completed',
      });

      if (error) throw error;

      // Verificar sucesso retornado pela função SQL
      // A função retorna uma tabela, então data é um array
      const result = Array.isArray(data) ? data[0] : data;
      
      if (result && result.success === false) {
        throw new Error(result.error_message || 'Erro desconhecido ao processar transferência');
      }

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
