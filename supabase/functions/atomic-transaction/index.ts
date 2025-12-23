import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified transaction schema inline
const TransactionInputSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid(),
  status: z.enum(['pending', 'completed']),
  invoice_month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  invoice_month_overridden: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting atomic-transaction request');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verificar autenticação
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('Auth failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    const body = await req.json();
    console.log('Request body:', JSON.stringify(body));

    // Validação Zod
    const validation = TransactionInputSchema.safeParse(body.transaction);
    if (!validation.success) {
      console.error('Validation failed:', validation.error.issues);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transaction = validation.data;
    console.log('Validated transaction:', JSON.stringify(transaction));

    // Usar função PL/pgSQL atômica
    const { data: result, error: functionError } = await supabaseClient.rpc('atomic_create_transaction', {
      p_user_id: user.id,
      p_description: transaction.description,
      p_amount: transaction.amount,
      p_date: transaction.date,
      p_type: transaction.type,
      p_category_id: transaction.category_id || null,
      p_account_id: transaction.account_id,
      p_status: transaction.status,
      p_invoice_month: transaction.invoice_month || null,
      p_invoice_month_overridden: transaction.invoice_month_overridden || false,
    });

    if (functionError) {
      console.error('RPC function call failed:', functionError);
      throw functionError;
    }

    console.log('RPC result:', JSON.stringify(result));

    // ✅ BUG FIX: Validar se result existe e é array antes de acessar
    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('Invalid or empty result from RPC:', result);
      return new Response(
        JSON.stringify({ 
          error: 'Transaction creation failed: Invalid response from database',
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const record = result[0];
    
    // ✅ Validar se record tem estrutura esperada
    if (!record || typeof record !== 'object') {
      console.error('Invalid record structure:', record);
      return new Response(
        JSON.stringify({ 
          error: 'Transaction creation failed: Invalid record structure',
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!record.success) {
      console.error('Transaction creation failed:', record.error_message);
      return new Response(
        JSON.stringify({ 
          error: record.error_message || 'Transaction creation failed',
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Transaction created successfully:', record.transaction_id);

    return new Response(
      JSON.stringify({
        transaction: {
          id: record.transaction_id,
          ...transaction
        },
        balance: record.new_balance,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unhandled exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
