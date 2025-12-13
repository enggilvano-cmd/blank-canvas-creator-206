import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';
import { 
  FixedTransactionInputSchema,
  validateWithZod, 
  validationErrorResponse 
} from '../_shared/validation.ts';
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { withRetry } from '../_shared/retry.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply rate limiting (increased limit for bulk imports)
    const rateLimiter = new (await import('../_shared/upstash-rate-limiter.ts')).UpstashRateLimiter({
      windowMs: 5 * 60 * 1000, // 5 minutos
      maxRequests: 200, // 200 requests por 5 minutos para permitir importações em massa
    });
    const rateLimitResult = await rateLimiter.middleware(req, user.id);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = validateWithZod(FixedTransactionInputSchema, body);

    if (!validation.success) {
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const validatedData = validation.data;

    // Call atomic SQL function with retry
    const { data, error } = await withRetry(
      async () => supabaseClient.rpc(
        'atomic_create_fixed_transaction',
        {
          p_user_id: user.id,
          p_description: validatedData.description,
          p_amount: validatedData.amount,
          p_date: validatedData.date,
          p_type: validatedData.type,
          p_category_id: validatedData.category_id,
          p_account_id: validatedData.account_id,
          p_status: validatedData.status,
          p_is_provision: validatedData.is_provision || false,
        }
      )
    );

    if (error) {
      console.error('RPC error:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Database operation failed', 
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Extract result from array (RPC returns array)
    const result = Array.isArray(data) ? data[0] : data;

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          error: result.error_message || 'Transaction creation failed' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        created_count: result.created_count,
        parent_id: result.parent_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
      details: (error as Error)?.message || 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
