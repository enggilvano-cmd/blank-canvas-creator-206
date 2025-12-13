import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import webpush from 'https://esm.sh/web-push@3.6.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Logger estruturado
    const logger = {
      info: (msg: string, data?: unknown) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, error?: unknown) => console.error(`[ERROR] ${msg}`, error || ''),
      warn: (msg: string, data?: unknown) => console.warn(`[WARN] ${msg}`, data || ''),
    };

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Configure web-push
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured')
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    )

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('user_id, role, trial_expires_at, subscription_expires_at')
      .in('role', ['trial', 'subscriber'])

    if (profilesError) throw profilesError

    const notificationsToSend = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const profile of profiles) {
      let expiresAt = null
      if (profile.role === 'trial' && profile.trial_expires_at) {
        expiresAt = new Date(profile.trial_expires_at)
      } else if (profile.role === 'subscriber' && profile.subscription_expires_at) {
        expiresAt = new Date(profile.subscription_expires_at)
      }

      if (!expiresAt) continue

      expiresAt.setHours(0, 0, 0, 0)
      
      // Calculate difference in days
      const diffTime = expiresAt.getTime() - today.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      // Check if matches 30, 5, 2, 1, 0
      if ([30, 5, 2, 1, 0].includes(diffDays)) {
        let title = ''
        let body = ''

        if (diffDays === 0) {
          title = 'Assinatura Expirando Hoje!'
          body = 'Sua assinatura expira hoje. Renove para continuar acessando todos os recursos.'
        } else if (diffDays === 1) {
          title = 'Assinatura Expira Amanhã'
          body = 'Falta apenas 1 dia para sua assinatura expirar.'
        } else {
          title = 'Aviso de Expiração'
          body = `Sua assinatura expira em ${diffDays} dias.`
        }

        notificationsToSend.push({
          userId: profile.user_id,
          title,
          body
        })
      }
    }

    logger.info(`Found ${notificationsToSend.length} users to notify`)

    // Send notifications
    const results = []
    for (const notification of notificationsToSend) {
      // Get subscriptions for user
      const { data: subscriptions } = await supabaseClient
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', notification.userId)

      if (!subscriptions || subscriptions.length === 0) continue

      for (const sub of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }

          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify({
              title: notification.title,
              body: notification.body,
              icon: '/icon-192.png',
              badge: '/favicon.png',
              url: '/profile' // Action URL
            })
          )
          results.push({ userId: notification.userId, status: 'sent' })
        } catch (error) {
          console.error(`Error sending to user ${notification.userId}:`, error)
          
          // If 410 Gone, remove subscription
          if (error.statusCode === 410) {
            await supabaseClient
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id)
          }
          
          results.push({ userId: notification.userId, status: 'error', error: error.message })
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
