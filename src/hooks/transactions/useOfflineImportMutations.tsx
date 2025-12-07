import { useCallback } from 'react';
import { useImportMutations } from './useImportMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { ImportTransactionData } from '@/types';
import { getErrorMessage } from '@/types/errors';

export function useOfflineImportMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useImportMutations();
  const { toast } = useToast();

  const processOfflineImport = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    try {
      await offlineQueue.enqueue({
        type: 'import_transactions',
        data: {
          transactions: transactionsData,
          replace_ids: transactionsToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Transactions import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue transactions import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (isOnline) {
      try {
        return await onlineMutations.handleImportTransactions(transactionsData, transactionsToReplace);
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during transactions import, falling back to offline mode');
          await processOfflineImport(transactionsData, transactionsToReplace);
          return;
        }
        throw error;
      }
    }

    await processOfflineImport(transactionsData, transactionsToReplace);
  }, [isOnline, onlineMutations, toast, processOfflineImport]);

  return {
    handleImportTransactions,
  };
}
