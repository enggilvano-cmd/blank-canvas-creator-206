import { useState, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { offlineSync } from '@/lib/offlineSync';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import type { Transaction } from '@/types';

interface UseFixedTransactionsResult {
  data: Transaction[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFixedTransactions(): UseFixedTransactionsResult {
  const [data, setData] = useState<Transaction[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  const loadData = async () => {
    if (!user) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      // setIsLoading(true); // Removido para evitar flicker (loading skeleton) em atualizações subsequentes
      
      // Carrega do cache primeiro (instantâneo)
      const cachedData = await offlineDatabase.getFixedTransactions(user.id);
      setData(cachedData);
      setIsLoading(false);

      // Se online, sincroniza em background (silenciosamente)
      if (isOnline) {
        try {
          // Dispara o sync (que vai atualizar o DB local)
          await offlineSync.syncAll(); 
          
          // Recarrega do cache após o sync terminar
          const freshData = await offlineDatabase.getFixedTransactions(user.id);
          setData(freshData);
        } catch (syncError) {
          // Sync error não deve bloquear a UI - apenas logamos
          logger.debug('Background sync failed (non-critical):', syncError);
        }
      }
    } catch (err) {
      logger.error('Failed to load fixed transactions:', err);
      setError(err as Error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, isOnline]);

  return { data, isLoading, error, refetch: loadData };
}
