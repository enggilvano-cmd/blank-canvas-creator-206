import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreditPaymentMutations } from './useCreditPaymentMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/types/errors';
import { Transaction, Account } from '@/types';
import { queryKeys } from '@/lib/queryClient';

export function useOfflineCreditPaymentMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useCreditPaymentMutations();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCreditPayment = useCallback(async ({
    creditCardAccountId,
    debitAccountId,
    amount,
    paymentDate,
  }: {
    creditCardAccountId: string;
    debitAccountId: string;
    amount: number;
    paymentDate: string;
  }): Promise<{ creditAccount: Account; bankAccount: Account }> => {
    const enqueueOfflinePayment = async () => {
      try {
        await offlineQueue.enqueue({
          type: 'credit_payment',
          data: {
            credit_account_id: creditCardAccountId,
            debit_account_id: debitAccountId,
            amount: Math.abs(amount),
            payment_date: paymentDate,
          }
        });

        toast({
          title: 'Pagamento registrado',
          description: 'Será sincronizado quando você voltar online.',
          duration: 3000,
        });

        logger.info('Credit payment queued for offline sync');

        //  Invalidar queries para refetch imediato
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        // Return dummy data for offline mode
        throw new Error('Operação offline - aguardando sincronização');
      } catch (error) {
        logger.error('Failed to queue credit payment:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível registrar o pagamento offline.',
          variant: 'destructive',
        });
        throw error;
      }
    };

    if (isOnline) {
      try {
        return await onlineMutations.handleCreditPayment({
          creditCardAccountId,
          debitAccountId,
          amount,
          paymentDate,
        });
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
          logger.warn('Network/Edge Function error ao registrar pagamento, usando modo offline.', error);
          return await enqueueOfflinePayment();
        }
        throw error;
      }
    }

    return await enqueueOfflinePayment();
  }, [isOnline, onlineMutations, toast, queryClient]);

  const handleReversePayment = useCallback(async (paymentsToReverse: Transaction[]) => {
    const enqueueOfflineReverse = async () => {
      try {
        await Promise.all(
          paymentsToReverse.map(payment =>
            offlineQueue.enqueue({
              type: 'delete',
              data: {
                transaction_id: payment.id,
                scope: 'current',
              }
            })
          )
        );

        toast({
          title: 'Estorno registrado',
          description: 'Será sincronizado quando você voltar online.',
          duration: 3000,
        });

        logger.info('Reverse payment queued for offline sync');

        //  Invalidar queries para refetch imediato
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      } catch (error) {
        logger.error('Failed to queue reverse payment:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível registrar o estorno offline.',
          variant: 'destructive',
        });
        throw error;
      }
    };

    if (isOnline) {
      try {
        return await onlineMutations.handleReversePayment(paymentsToReverse);
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
          logger.warn('Network/Edge Function error ao registrar estorno, usando modo offline.', error);
          await enqueueOfflineReverse();
          return;
        }
        throw error;
      }
    }

    await enqueueOfflineReverse();
  }, [isOnline, onlineMutations, toast, queryClient]);

  return {
    handleCreditPayment,
    handleReversePayment,
  };
}
