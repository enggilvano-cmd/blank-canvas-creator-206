import { useState, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { offlineSync } from '@/lib/offlineSync';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import type { Transaction, Account, Category } from '@/types';

interface UseOfflineDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useOfflineTransactions(): UseOfflineDataResult<Transaction[]> {
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
      setIsLoading(true);
      
      // Carrega do cache primeiro (instantâneo)
      const cachedData = await offlineDatabase.getTransactions(user.id, 6); // Aumentado para 6 meses
      setData(cachedData);
      setIsLoading(false);

      // Se online, sincroniza em background
      if (isOnline) {
        // Dispara o sync (que vai atualizar o DB local)
        await offlineSync.syncAll(); // Alterado para syncAll para processar fila + baixar dados
        
        // Recarrega do cache após o sync terminar
        const freshData = await offlineDatabase.getTransactions(user.id, 6);
        setData(freshData);
      }
    } catch (err) {
      logger.error('Failed to load transactions:', err);
      setError(err as Error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, isOnline]);

  return { data, isLoading, error, refetch: loadData };
}

export function useOfflineAccounts(): UseOfflineDataResult<Account[]> {
  const [data, setData] = useState<Account[] | null>(null);
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
      setIsLoading(true);
      const cachedData = await offlineDatabase.getAccounts(user.id);
      setData(cachedData);
      setIsLoading(false);

      if (isOnline) {
        await offlineSync.syncAll();
        const freshData = await offlineDatabase.getAccounts(user.id);
        setData(freshData);
      }
    } catch (err) {
      logger.error('Failed to load accounts:', err);
      setError(err as Error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, isOnline]);

  return { data, isLoading, error, refetch: loadData };
}

export function useOfflineCategories(): UseOfflineDataResult<Category[]> {
  const [data, setData] = useState<Category[] | null>(null);
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
      setIsLoading(true);
      const cachedData = await offlineDatabase.getCategories(user.id);
      setData(cachedData);
      setIsLoading(false);

      if (isOnline) {
        await offlineSync.syncAll();
        const freshData = await offlineDatabase.getCategories(user.id);
        setData(freshData);
      }
    } catch (err) {
      logger.error('Failed to load categories:', err);
      setError(err as Error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, isOnline]);

  return { data, isLoading, error, refetch: loadData };
}