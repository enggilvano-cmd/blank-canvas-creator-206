import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Notification, NotificationSettings } from '@/lib/notifications';
import { differenceInDays, parseISO } from 'date-fns';
import {
  getDueDateReminders,
  getLowBalanceAlerts,
  requestNotificationPermission,
  showSystemNotification,
} from '@/lib/notifications';
import {
  isPushNotificationSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  isPushSubscribed,
} from '@/lib/pushNotifications';
import { calculateBillDetails } from '@/lib/dateUtils';
import type { AppTransaction } from '@/types';

export function useNotifications() {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    billReminders: true,
    transactionAlerts: true,
    budgetAlerts: true,
    dueDateReminders: 3, // days before due date
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('dismissed_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Load notification settings
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('notifications')
        .eq('user_id', user.id)
        .single();

      if (data?.notifications !== undefined) {
        setSettings(prev => ({ ...prev, billReminders: data.notifications }));
      }
    };

    loadSettings();
  }, [user]);

  // Check for notifications
  const checkNotifications = useCallback(async () => {
    if (!user || !settings.billReminders) return;

    try {
      // Fetch accounts with specific columns only
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name, type, balance, due_date, closing_date, limit_amount')
        .eq('user_id', user.id);

      if (!accounts) return;

      // Calculate bill amounts for credit cards
      const billAmounts: Record<string, number> = {};
      const creditAccounts = accounts.filter(a => a.type === 'credit');
      
      if (creditAccounts.length > 0 && settings.billReminders) {
         // Fetch transactions for credit accounts (last 60 days to be safe)
         const today = new Date();
         const twoMonthsAgo = new Date(today);
         twoMonthsAgo.setDate(today.getDate() - 60);
         
         const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .in('account_id', creditAccounts.map(a => a.id))
            .gte('date', twoMonthsAgo.toISOString().split('T')[0]);
            
         if (transactions) {
             const appTransactions = transactions.map(t => ({
                 ...t,
                 date: new Date(t.date) // Ensure date is Date object
             })) as any as AppTransaction[];
             
             creditAccounts.forEach(account => {
                 const accountTransactions = appTransactions.filter(t => t.account_id === account.id);
                 // calculateBillDetails expects Account type, but we only have partial account.
                 // It needs closing_date, due_date, limit_amount. We have those.
                 const details = calculateBillDetails(accountTransactions, account as any, 0);
                 billAmounts[account.id] = details.currentBillAmount;
             });
         }
      }

      const newNotifications: Notification[] = [];

      // Get due date reminders for credit cards
      if (settings.billReminders) {
        const reminders = getDueDateReminders(accounts, settings, billAmounts);
        newNotifications.push(...reminders);
      }

      // Get low balance alerts
      if (settings.transactionAlerts) {
        const alerts = getLowBalanceAlerts(accounts);
        newNotifications.push(...alerts);
      }

      // Check for subscription expiration
      if (profile) {
        let expiresAt: Date | null = null;

        if (profile.role === 'trial' && profile.trial_expires_at) {
          expiresAt = parseISO(profile.trial_expires_at);
        } else if (profile.role === 'subscriber' && profile.subscription_expires_at) {
          expiresAt = parseISO(profile.subscription_expires_at);
        }

        if (expiresAt) {
          const today = new Date();
          const daysRemaining = differenceInDays(expiresAt, today);
          const triggers = [30, 5, 2, 1, 0];

          if (triggers.includes(daysRemaining) || daysRemaining < 0) {
            let title = '';
            let message = '';
            let type: 'alert' | 'reminder' = 'reminder';

            if (daysRemaining < 0) {
              title = 'Assinatura Expirada';
              message = 'Sua assinatura expirou. Renove para continuar acessando todos os recursos.';
              type = 'alert';
            } else if (daysRemaining === 0) {
              title = 'Assinatura Expirando Hoje!';
              message = 'Sua assinatura expira hoje. Renove para continuar acessando todos os recursos.';
              type = 'alert';
            } else if (daysRemaining === 1) {
              title = 'Assinatura Expira Amanhã';
              message = 'Falta apenas 1 dia para sua assinatura expirar.';
              type = 'alert';
            } else {
              title = 'Aviso de Expiração';
              message = `Sua assinatura expira em ${daysRemaining} dias.`;
              type = daysRemaining <= 5 ? 'alert' : 'reminder';
            }

            newNotifications.push({
              id: `expiration_${daysRemaining}_${today.toISOString().split('T')[0]}`,
              title,
              message,
              type,
              date: today,
              read: false,
              actionType: 'account_low', // Reusing existing type or add new one if needed
            });
          }
        }
      }

      // Update notifications
      const filteredNotifications = newNotifications.filter(n => !dismissedIds.includes(n.id));
      setNotifications(filteredNotifications);
      setUnreadCount(filteredNotifications.filter(n => !n.read).length);

      // Show browser notifications for new critical notifications
      if (filteredNotifications.length > 0 && Notification.permission === 'granted') {
        filteredNotifications.slice(0, 3).forEach(notification => {
          // Only show if not already shown (this is a simple check, ideally we'd track shown IDs too)
          // For now, we rely on the fact that we only show the top 3
          if (notification.type === 'reminder' || notification.type === 'alert') {
            showSystemNotification(notification.title, {
              body: notification.message,
              tag: notification.id,
            });
          }
        });
      }
    } catch (error) {
      logger.error('Error checking notifications:', error);
    }
  }, [user, settings, profile, dismissedIds]);

  // Check notifications on mount and periodically
  useEffect(() => {
    checkNotifications();
    
    // Check every 5 minutes
    const interval = setInterval(checkNotifications, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [checkNotifications]);

  // Check push subscription status
  useEffect(() => {
    const checkPushStatus = async () => {
      if (user && isPushNotificationSupported()) {
        let subscribed = await isPushSubscribed();
        
        // Auto-recovery: If not subscribed but permission granted, try to resubscribe
        if (!subscribed && Notification.permission === 'granted') {
           logger.info('Permission granted but no subscription found. Attempting to restore...');
           try {
             const subscription = await subscribeToPushNotifications(user.id);
             if (subscription) {
               subscribed = true;
               logger.success('Push subscription restored automatically');
             }
           } catch (e) {
             logger.error('Failed to restore push subscription:', e);
           }
        }
        
        setPushEnabled(subscribed);
      }
    };
    checkPushStatus();
  }, [user]);

  // Request notification permission on first load
  useEffect(() => {
    if (settings.billReminders && Notification.permission === 'default') {
      requestNotificationPermission();
    }
  }, [settings.billReminders]);

  const enablePushNotifications = useCallback(async () => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    try {
      const subscription = await subscribeToPushNotifications(user.id);
      if (subscription) {
        setPushEnabled(true);
        return { success: true };
      }
      
      // Se retornou null sem lançar erro, verifique permissões
      if (Notification.permission === 'denied') {
        return { success: false, error: 'Permissão de notificação negada. Habilite nas configurações do navegador.' };
      }
      
      return { success: false, error: 'Falha ao obter subscrição. Verifique se o app está instalado na tela inicial (iOS) ou se o navegador suporta notificações.' };
    } catch (error: any) {
      logger.error('Error enabling push notifications:', error);
      return { success: false, error: error.message || 'Erro desconhecido ao ativar notificações' };
    }
  }, [user]);

  const disablePushNotifications = useCallback(async () => {
    if (!user) return false;

    try {
      const success = await unsubscribeFromPushNotifications(user.id);
      if (success) {
        setPushEnabled(false);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error disabling push notifications:', error);
      return false;
    }
  }, [user]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setDismissedIds(prev => {
      const newIds = [...prev, notificationId];
      localStorage.setItem('dismissed_notifications', JSON.stringify(newIds));
      return newIds;
    });
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const clearAll = useCallback(() => {
    const idsToDismiss = notifications.map(n => n.id);
    setNotifications([]);
    setDismissedIds(prev => {
      const newIds = [...prev, ...idsToDismiss];
      localStorage.setItem('dismissed_notifications', JSON.stringify(newIds));
      return newIds;
    });
    setUnreadCount(0);
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    settings,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAll,
    refresh: checkNotifications,
    pushEnabled,
    isPushSupported: isPushNotificationSupported(),
    enablePushNotifications,
    disablePushNotifications,
  };
}
