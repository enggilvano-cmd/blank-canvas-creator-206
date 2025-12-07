import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export function useRealtimeSubscription() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    logger.info('Setting up realtime subscriptions for user:', user.id);
    
    // ✅ BUG FIX #2: Track resources for proper cleanup
    const eventListeners: Array<{ target: any; event: string; handler: any }> = [];
    const timers: NodeJS.Timeout[] = [];

    // Função auxiliar para invalidar transações de forma robusta
    const invalidateTransactions = () => {
      logger.info('Invalidating transactions queries...');
      
      // 1. Invalida usando a chave base (padrão)
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      
      // 2. Invalida usando predicado para garantir que pegue todas as variações de filtros
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === 'transactions'
      });

      // 3. Invalida especificamente o count
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === 'transactions' &&
          query.queryKey.includes('count')
      });
    };

    const invalidateAccounts = () => {
      logger.info('Invalidating accounts queries...');
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    };

    const invalidateCategories = () => {
      logger.info('Invalidating categories queries...');
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    };

    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        (payload) => {
          logger.info('Realtime update received for transactions:', payload);
          invalidateTransactions();
          invalidateAccounts();
          
          // Retry de segurança após 500ms para garantir consistência
          const timer1 = setTimeout(() => {
            invalidateTransactions();
            invalidateAccounts();
          }, 500);
          timers.push(timer1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
        },
        (payload) => {
          logger.info('Realtime update received for accounts:', payload);
          invalidateAccounts();
          invalidateTransactions();
          
          const timer2 = setTimeout(() => {
            invalidateAccounts();
            invalidateTransactions();
          }, 500);
          timers.push(timer2);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        (payload) => {
          logger.info('Realtime update received for categories:', payload);
          invalidateCategories();
          invalidateTransactions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fixed_transactions',
        },
        (payload) => {
            logger.info('Realtime update received for fixed_transactions:', payload);
            invalidateTransactions();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            logger.info('Successfully subscribed to realtime changes');
        } else if (status === 'CHANNEL_ERROR') {
            logger.error('Failed to subscribe to realtime changes');
        }
      });

    return () => {
      logger.info('Cleaning up realtime subscriptions');
      
      // ✅ BUG FIX #2: Complete cleanup to prevent memory leaks
      // Clear all timers
      timers.forEach(timer => clearTimeout(timer));
      
      // Remove channel and all its listeners
      supabase.removeChannel(channel);
      
      // Clear event listeners array
      eventListeners.forEach(({ target, event, handler }) => {
        try {
          target.removeEventListener(event, handler);
        } catch (error) {
          logger.warn('Failed to remove event listener:', error);
        }
      });
      
      logger.info('Realtime subscription cleanup complete');
    };
  }, [user, queryClient]);
}
