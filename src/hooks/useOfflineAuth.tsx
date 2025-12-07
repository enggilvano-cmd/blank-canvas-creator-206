import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

const USER_CACHE_KEY = 'planiflow_offline_user';

export function useOfflineAuth() {
  const isOnline = useOnlineStatus();
  const auth = useAuth();
  const { toast } = useToast();
  
  // Cache local para persistir o usuário mesmo se o Supabase falhar offline
  const [cachedUser, setCachedUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_CACHE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      logger.error('Erro ao ler cache de usuário:', e);
      return null;
    }
  });

  // Mantém o cache atualizado sempre que o usuário online mudar
  useEffect(() => {
    if (auth.user) {
      setCachedUser(auth.user);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(auth.user));
    }
  }, [auth.user]);

  const signOut = useCallback(async () => {
    // 1. Limpeza imediata do cache local (crítico para segurança)
    localStorage.removeItem(USER_CACHE_KEY);
    setCachedUser(null);

    // 2. Limpeza do banco de dados local
    try {
      await offlineDatabase.clearAll();
    } catch (e) {
      logger.error("Erro ao limpar banco local no logout", e);
    }

    // 3. Limpeza de caches do Service Worker (API e Storage)
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.map(key => {
            // Limpa caches específicos de dados do usuário
            if (key.includes('supabase-api-cache') || key.includes('supabase-storage-cache')) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
        logger.info("Caches do Service Worker limpos com sucesso");
      } catch (e) {
        logger.error("Erro ao limpar caches do SW", e);
      }
    }

    if (isOnline) {
      return auth.signOut();
    }

    // 3. Processo Offline: Enfileira o logout para o servidor saber depois
    try {
      await offlineQueue.enqueue({
        type: 'logout',
        data: {}
      });

      // Força o redirecionamento visual
      window.location.href = '/auth';
      
      return { error: null };
    } catch (error) {
      logger.error('Failed to queue logout:', error);
      // Mesmo com erro, garante a saída do usuário
      window.location.href = '/auth';
      return { error: error as any };
    }
  }, [isOnline, auth, toast]);

  // Se auth.user for nulo (ex: sem net), usa o cachedUser
  const effectiveUser = auth.user || cachedUser;
  
  // Se temos cache, a UI não precisa ficar em "loading" infinito
  const effectiveLoading = cachedUser ? false : auth.loading;

  return {
    ...auth,
    user: effectiveUser,
    loading: effectiveLoading,
    signOut,
    isOnline,
  };
}