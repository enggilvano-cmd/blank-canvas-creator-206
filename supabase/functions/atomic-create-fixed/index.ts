import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('atomic-create-fixed: Starting request processing');
    
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
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('atomic-create-fixed: User authenticated:', user.id);

    // Parse request body
    const body = await req.json();
    console.log('atomic-create-fixed: Request body:', JSON.stringify(body));

    // Basic validation
    if (!body.description || !body.amount || !body.date || !body.type || !body.account_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: description, amount, date, type, account_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call atomic SQL function
    const { data, error } = await supabaseClient.rpc(
      'atomic_create_fixed_transaction',
      {
        p_user_id: user.id,
        p_description: body.description,
        p_amount: body.amount,
        p_date: body.date,
        p_type: body.type,
        p_category_id: body.category_id || null,
        p_account_id: body.account_id,
        p_status: body.status || 'pending',
        p_is_provision: body.is_provision || false,
      }
    );

    console.log('atomic-create-fixed: RPC result:', JSON.stringify({ data, error }));

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

    if (!result || !result.success) {
      console.error('Operation failed:', result?.error_message);
      return new Response(
        JSON.stringify({ 
          error: result?.error_message || 'Transaction creation failed' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('atomic-create-fixed: Success! Created', result.created_count, 'transactions');

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
