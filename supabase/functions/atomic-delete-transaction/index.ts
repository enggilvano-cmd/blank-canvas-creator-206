import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DeleteTransactionInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';
import { rateLimiters } from '../_shared/rate-limiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteInput {
  transaction_id: string;
  scope?: 'current' | 'current-and-remaining' | 'all';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply moderate rate limiting for deletion operations (allows bulk deletes)
    const rateLimitResponse = await rateLimiters.moderate.middleware(req, user.id);
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for user:', user.id);
      return rateLimitResponse;
    }

    const body = await req.json();

    logger.info('Deleting transaction for user:', user.id);

    // Validação Zod
    const validation = validateWithZod(DeleteTransactionInputSchema, body);
    if (!validation.success) {
      logger.error('Validation failed:', validation.errors);
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const { transaction_id, scope } = validation.data;

    // Usar função PL/pgSQL atômica com retry
    const { data: result, error: functionError } = await withRetry(
      async () => supabaseClient.rpc('atomic_delete_transaction', {
        p_user_id: user.id,
        p_transaction_id: transaction_id,
        p_scope: scope || 'current',
      })
    );

    if (functionError) {
      console.error('[atomic-delete-transaction] ERROR: Function failed:', functionError);
      throw functionError;
    }

    const record = result?.[0];
    
    if (!record) {
      console.error('[atomic-delete-transaction] ERROR: No result returned');
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete transaction',
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!record.success) {
      // Treat "Transaction not found" as a non-fatal, idempotent delete
      if (record.error_message === 'Transaction not found') {
        console.warn('[atomic-delete-transaction] WARN: Transaction already deleted or not found, treating as success');
        return new Response(
          JSON.stringify({
            deleted: 0,
            affected_accounts: [],
            success: true,
            warning: record.error_message,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('[atomic-delete-transaction] ERROR:', record.error_message);
      return new Response(
        JSON.stringify({
          error: record.error_message || 'Failed to delete transaction',
          success: false,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Deleted ${record.deleted_count} transaction(s)`);

    return new Response(
      JSON.stringify({
        deleted: record.deleted_count,
        affected_accounts: record.affected_accounts,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[atomic-delete] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});