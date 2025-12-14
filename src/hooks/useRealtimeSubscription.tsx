import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { logger } from '@/lib/logger';
import { globalResourceManager } from '@/lib/globalResourceManager';

export function useRealtimeSubscription() {
  const { invalidateTransactions, invalidateAccounts, invalidateCategories, helper } = useQueryInvalidation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    logger.info('Setting up realtime subscriptions for user:', user.id);
    
    // ✅ BUG FIX #2: Track resources for proper cleanup with global manager
    const timerIds: string[] = [];
    const listenerIds: string[] = [];

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
          const timer1Id = globalResourceManager.registerTimeout(timer1, 'Realtime transactions retry');
          timerIds.push(timer1Id);
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
          const timer2Id = globalResourceManager.registerTimeout(timer2, 'Realtime accounts retry');
          timerIds.push(timer2Id);
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
      
      // ✅ BUG FIX #2: Complete cleanup to prevent memory leaks using global manager
      // Clear all registered timers
      timerIds.forEach(id => globalResourceManager.unregister(id));
      
      // Clear all registered listeners
      listenerIds.forEach(id => globalResourceManager.unregister(id));
      
      // Remove channel and all its listeners
      supabase.removeChannel(channel);
      
      logger.info('Realtime subscription cleanup complete');
    };
  }, [user, invalidateTransactions, invalidateAccounts, invalidateCategories]);
}
