import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

interface NotificationPayload {
  title: string;
  body: string;
  data?: {
    url?: string;
    [key: string]: any;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify CRON secret for security
    const authHeader = req.headers.get('authorization');
    const cronSecret = req.headers.get('x-cron-secret');
    
    if (cronSecret !== CRON_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid CRON secret' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // Find pending transactions due tomorrow
    const { data: pendingTransactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('id, description, amount, user_id, date')
      .eq('status', 'pending')
      .gte('date', tomorrow.toISOString().split('T')[0])
      .lte('date', tomorrowEnd.toISOString().split('T')[0]);

    if (transactionsError) {
      throw transactionsError;
    }

    // Find credit card bills due tomorrow
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, due_date, user_id, limit_amount')
      .eq('type', 'credit');

    if (accountsError) {
      throw accountsError;
    }

    // Filter accounts with due_date matching tomorrow's day
    const tomorrowDay = tomorrow.getDate();
    const creditBillsDueTomorrow = accounts?.filter(acc => acc.due_date === tomorrowDay) || [];

    // Group notifications by user
    const userNotifications = new Map<string, NotificationPayload[]>();

    // Add pending transaction notifications
    pendingTransactions?.forEach(tx => {
      if (!userNotifications.has(tx.user_id)) {
        userNotifications.set(tx.user_id, []);
      }
      userNotifications.get(tx.user_id)!.push({
        title: 'Conta a Pagar Amanhã',
        body: `${tx.description} - R$ ${Math.abs(tx.amount).toFixed(2)}`,
        data: {
          url: '/transactions',
          transactionId: tx.id
        }
      });
    });

    // Add credit bill notifications
    creditBillsDueTomorrow.forEach(account => {
      if (!userNotifications.has(account.user_id)) {
        userNotifications.set(account.user_id, []);
      }
      userNotifications.get(account.user_id)!.push({
        title: 'Fatura de Cartão Vence Amanhã',
        body: `${account.name} - Vencimento dia ${account.due_date}`,
        data: {
          url: '/credit-bills',
          accountId: account.id
        }
      });
    });

    let notificationsSent = 0;
    let notificationsFailed = 0;

    // Send notifications to each user
    for (const [userId, notifications] of userNotifications) {
      // Get user's notification settings
      const { data: settings } = await supabase
        .from('notification_settings')
        .select('notify_pending_transactions, notify_credit_bills')
        .eq('user_id', userId)
        .single();

      if (!settings?.notify_pending_transactions && !settings?.notify_credit_bills) {
        continue;
      }

      // Get user's push subscriptions
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (subsError || !subscriptions || subscriptions.length === 0) {
        continue;
      }

      // Send notification to each subscription
      for (const subscription of subscriptions) {
        for (const notification of notifications) {
          try {
            // Use Web Push protocol to send notification
            const pushSubscription = {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            };

            // Call send-push-notification edge function
            const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                subscription: pushSubscription,
                notification
              }
            });

            if (pushError) {
              notificationsFailed++;
            } else {
              notificationsSent++;
            }
          } catch (error) {
            notificationsFailed++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bill reminders processed',
        stats: {
          pendingTransactions: pendingTransactions?.length || 0,
          creditBills: creditBillsDueTomorrow.length,
          notificationsSent,
          notificationsFailed,
          usersNotified: userNotifications.size
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
