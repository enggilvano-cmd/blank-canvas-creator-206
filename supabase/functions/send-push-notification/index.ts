import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushNotificationPayload {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

// Web Push helper function
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: any
) {
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@planiflow.app';

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys not configured');
  }

  // Import web-push functionality
  const webpush = await import('npm:web-push@3.6.7');
  
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 24, // 24 hours
      }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    
    // If subscription is invalid (410), mark it for deletion
    if (error.statusCode === 410) {
      return { success: false, invalidSubscription: true };
    }
    
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const payload: PushNotificationPayload = await req.json();

    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'Title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine target user IDs
    let targetUserIds: string[] = [];
    if (payload.userId) {
      targetUserIds = [payload.userId];
    } else if (payload.userIds && payload.userIds.length > 0) {
      targetUserIds = payload.userIds;
    } else {
      return new Response(
        JSON.stringify({ error: 'userId or userIds required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch push subscriptions for target users
    const { data: subscriptions, error: fetchError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds);

    if (fetchError) {
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No push subscriptions found for target users',
          sent: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare notification payload
    const notificationPayload = {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/favicon.png',
      tag: payload.tag || 'planiflow-notification',
      requireInteraction: payload.requireInteraction || false,
      data: {
        url: payload.url || '/',
        timestamp: new Date().toISOString(),
      },
      actions: payload.actions || [],
    };

    // Send notifications to all subscriptions
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendWebPush(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
          notificationPayload
        );

        // Delete invalid subscriptions
        if (result.invalidSubscription) {
          await supabaseClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }

        return result;
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return new Response(
      JSON.stringify({
        message: 'Push notifications sent',
        sent: successCount,
        failed: failureCount,
        total: results.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
