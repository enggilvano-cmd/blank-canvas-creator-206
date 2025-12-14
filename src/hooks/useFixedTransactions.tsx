import { useState, useEffect, useCallback } from 'react';
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

// Event emitter global para notificar sobre mudanças em transações fixas
const fixedTransactionsListeners = new Set<() => void>();

export function notifyFixedTransactionsChange() {
  fixedTransactionsListeners.forEach(listener => listener());
}

export function useFixedTransactions(): UseFixedTransactionsResult {
  const [data, setData] = useState<Transaction[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Trigger for refetch
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  const loadData = useCallback(async () => {
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
          // Timeout de 5s para evitar travamento
          const syncPromise = offlineSync.syncAll();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sync timeout')), 5000)
          );
          
          await Promise.race([syncPromise, timeoutPromise]);
          
          // Recarrega do cache após o sync terminar
          const freshData = await offlineDatabase.getFixedTransactions(user.id);
          setData(freshData);
        } catch (syncError) {
          // Sync error não deve bloquear a UI - apenas logamos
          logger.debug('Background sync failed (non-critical):', syncError);
          // Continua usando dados do cache mesmo se sync falhar
        }
      }
    } catch (err) {
      logger.error('Failed to load fixed transactions:', err);
      setError(err as Error);
      setIsLoading(false);
    }
  }, [user?.id, isOnline]);

  useEffect(() => {
    loadData();
  }, [user?.id, isOnline, refreshKey, loadData]);

  useEffect(() => {
    // Registrar listener para mudanças
    const onChangeListener = () => {
      setRefreshKey(prev => prev + 1);
    };
    fixedTransactionsListeners.add(onChangeListener);

    return () => {
      fixedTransactionsListeners.delete(onChangeListener);
    };
  }, []);

  return { data, isLoading, error, refetch: loadData };
}
