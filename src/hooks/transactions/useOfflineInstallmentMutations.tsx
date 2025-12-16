import { useCallback } from 'react';
import { useInstallmentMutations } from './useInstallmentMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineSync } from '@/lib/offlineSync';
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
    // Sempre usar modo offline para resposta imediata (< 30ms)
    await processOfflineInstallments(transactionsData);
    
    if (isOnline) {
      // Dispara sincronização em background sem aguardar
      offlineSync.syncAll().catch(err => 
        logger.error('Background sync failed:', err)
      );
    }
  }, [isOnline, processOfflineInstallments]);

  return {
    handleAddInstallmentTransactions,
  };
}
