import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, parseISO, isSameDay } from 'date-fns';
import { safeStorage } from '@/lib/safeStorage';

const NOTIFICATION_KEY = 'last_expiration_notification_date';

export function useExpirationNotifications() {
  const { profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!profile) return;

    let expiresAt: Date | null = null;

    if (profile.trial_expires_at) {
      expiresAt = parseISO(profile.trial_expires_at);
    } else if (profile.subscription_expires_at) {
      expiresAt = parseISO(profile.subscription_expires_at);
    }

    if (!expiresAt) return;

    const today = new Date();
    const daysRemaining = differenceInDays(expiresAt, today);

    // Notification triggers: 30, 5, 2, 1, 0 days remaining
    const triggers = [30, 5, 2, 1, 0];

    if (triggers.includes(daysRemaining)) {
      const lastNotificationDate = safeStorage.getItem(NOTIFICATION_KEY);
      
      // Check if we already notified today
      if (lastNotificationDate && isSameDay(parseISO(lastNotificationDate), today)) {
        return;
      }

      // Determine message based on days remaining
      let title = '';
      let description = '';
      let variant: 'default' | 'destructive' = 'default';

      if (daysRemaining === 0) {
        title = 'Assinatura Expirando Hoje!';
        description = 'Sua assinatura expira hoje. Renove para continuar acessando todos os recursos.';
        variant = 'destructive';
      } else if (daysRemaining === 1) {
        title = 'Assinatura Expira Amanhã';
        description = 'Falta apenas 1 dia para sua assinatura expirar.';
        variant = 'destructive';
      } else {
        title = 'Aviso de Expiração';
        description = `Sua assinatura expira em ${daysRemaining} dias.`;
        variant = daysRemaining <= 5 ? 'destructive' : 'default';
      }

      toast({
        title,
        description,
        variant,
        duration: 10000, // Show for 10 seconds
      });

      // Save notification date
      safeStorage.setItem(NOTIFICATION_KEY, today.toISOString());
    }

  }, [profile, toast]);
}
