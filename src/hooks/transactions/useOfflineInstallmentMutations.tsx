import { useCallback } from 'react';
import { useInstallmentMutations } from './useInstallmentMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { InstallmentTransactionInput } from '@/types';
import { getErrorMessage } from '@/types/errors';

export function useOfflineInstallmentMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useInstallmentMutations();
  const { toast } = useToast();

  const processOfflineInstallments = useCallback(async (transactionsData: InstallmentTransactionInput[]) => {
    try {
      await offlineQueue.enqueue({
        type: 'add_installments',
        data: {
          transactions: transactionsData.map(data => ({
            description: data.description,
            amount: data.amount,
            date: data.date.toISOString().split('T')[0],
            type: data.type,
            category_id: data.category_id,
            account_id: data.account_id,
            status: data.status,
            invoice_month: data.invoiceMonth,
            current_installment: data.currentInstallment,
          })),
          total_installments: transactionsData.length,
        }
      });

      toast({
        title: 'Parcelamento registrado',
        description: 'Será sincronizado quando você voltar online.',
        duration: 3000,
      });

      logger.info('Installment transactions queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue installment transactions:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar o parcelamento offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const handleAddInstallmentTransactions = useCallback(async (transactionsData: InstallmentTransactionInput[]) => {
    if (isOnline) {
      try {
        return await onlineMutations.handleAddInstallmentTransactions(transactionsData);
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during installment creation, falling back to offline mode');
          await processOfflineInstallments(transactionsData);
          return;
        }
        throw error;
      }
    }

    await processOfflineInstallments(transactionsData);
  }, [isOnline, onlineMutations, toast, processOfflineInstallments]);

  return {
    handleAddInstallmentTransactions,
  };
}
