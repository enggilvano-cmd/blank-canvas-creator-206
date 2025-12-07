import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { TransferInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Rate limiting - Strict para transferências (operação sensível)
    const rateLimitResponse = await rateLimiters.strict.middleware(req, user.id);
    if (rateLimitResponse) {
      console.warn('[atomic-transfer] WARN: Rate limit exceeded for user:', user.id);
      return rateLimitResponse;
    }

    const body = await req.json();

    console.log('[atomic-transfer] INFO: Processing transfer for user:', user.id);

    // Validação Zod
    const validation = validateWithZod(TransferInputSchema, body.transfer || body);
    if (!validation.success) {
      console.error('[atomic-transfer] ERROR: Validation failed:', validation.errors);
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const transfer = validation.data;

    // Buscar nomes das contas para descrições mais claras com retry
    const { data: accounts } = await withRetry(
      () => supabaseClient
        .from('accounts')
        .select('id, name')
        .in('id', [transfer.from_account_id, transfer.to_account_id])
    );

    const fromAccount = accounts?.find(a => a.id === transfer.from_account_id);
    const toAccount = accounts?.find(a => a.id === transfer.to_account_id);

    // Gerar descrições automáticas se não foram fornecidas
    const outgoingDescription = transfer.outgoing_description || `Transferência para ${toAccount?.name || 'Conta Destino'}`;
    const incomingDescription = transfer.incoming_description || `Transferência de ${fromAccount?.name || 'Conta Origem'}`;

    // Usar função PL/pgSQL atômica com retry
    const { data: result, error: functionError } = await withRetry(
      () => supabaseClient.rpc('atomic_create_transfer', {
        p_user_id: user.id,
        p_from_account_id: transfer.from_account_id,
        p_to_account_id: transfer.to_account_id,
        p_amount: transfer.amount,
        p_outgoing_description: outgoingDescription,
        p_incoming_description: incomingDescription,
        p_date: transfer.date,
        p_status: transfer.status,
      })
    );

    if (functionError) {
      console.error('[atomic-transfer] ERROR: Function failed:', functionError);
      throw functionError;
    }

    const record = result[0];
    
    if (!record.success) {
      console.error('[atomic-transfer] ERROR:', record.error_message);
      return new Response(
        JSON.stringify({ 
          error: record.error_message,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[atomic-transfer] INFO: Transfer created successfully');

    return new Response(
      JSON.stringify({
        outgoing_transaction_id: record.outgoing_transaction_id,
        incoming_transaction_id: record.incoming_transaction_id,
        from_balance: record.from_balance,
        to_balance: record.to_balance,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[atomic-transfer] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});