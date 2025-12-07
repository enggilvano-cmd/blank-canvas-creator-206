import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransferMutations } from './useTransferMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/types/errors';
import { queryKeys } from '@/lib/queryClient';

export function useOfflineTransferMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useTransferMutations();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleTransfer = useCallback(
    async (
      fromAccountId: string,
      toAccountId: string,
      amount: number,
      date: Date
    ) => {
      const enqueueOfflineTransfer = async () => {
        try {
          await offlineQueue.enqueue({
            type: 'transfer',
            data: {
              from_account_id: fromAccountId,
              to_account_id: toAccountId,
              amount,
              date: date.toISOString().split('T')[0],
            },
          });

          toast({
            title: 'Transferência registrada',
            description: 'Será sincronizada quando você voltar online.',
            duration: 3000,
          });

          logger.info('Transfer queued for offline sync');

          // ✅ Invalidar queries para refetch imediato
          queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
          queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

          // Retornar contas simuladas para modo offline
          const accounts = queryClient.getQueryData<any[]>(queryKeys.accounts) || [];
          const fromAccount = accounts.find(acc => acc.id === fromAccountId);
          const toAccount = accounts.find(acc => acc.id === toAccountId);
          return { fromAccount, toAccount };
        } catch (error) {
          logger.error('Failed to queue transfer:', error);
          toast({
            title: 'Erro',
            description: 'Não foi possível registrar a transferência offline.',
            variant: 'destructive',
          });
          throw error;
        }
      };

      if (isOnline) {
        try {
          const result = await onlineMutations.handleTransfer(
            fromAccountId,
            toAccountId,
            amount,
            date
          );
          return result;
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
            logger.warn('Network/Edge Function error ao registrar transferência, usando modo offline.', error);
            return await enqueueOfflineTransfer();
          }
          throw error;
        }
      }

      return await enqueueOfflineTransfer();
    },
    [isOnline, onlineMutations, toast, queryClient]
  );

  return {
    handleTransfer,
  };
}
