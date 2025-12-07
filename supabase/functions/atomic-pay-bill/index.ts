import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PayBillInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';
import { rateLimiters } from '../_shared/rate-limiter.ts';

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
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Apply strict rate limiting for payment operations
    const rateLimitResponse = await rateLimiters.strict.middleware(req, user.id);
    if (rateLimitResponse) {
      console.warn('[atomic-pay-bill] WARN: Rate limit exceeded for user:', user.id);
      return rateLimitResponse;
    }

    const body = await req.json();

    console.log('[atomic-pay-bill] INFO: Processing bill payment for user:', user.id);

    // Validação Zod
    const validation = validateWithZod(PayBillInputSchema, body);
    if (!validation.success) {
      console.error('[atomic-pay-bill] ERROR: Validation failed:', validation.errors);
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const { credit_account_id, debit_account_id, amount, payment_date, description } = validation.data;

    // Verificar se o período está fechado com retry
    const { data: isLocked } = await withRetry(
      async () => supabaseClient.rpc('is_period_locked', {
        p_user_id: user.id, 
        p_date: payment_date 
      })
    );

    if (isLocked) {
      console.error('[atomic-pay-bill] ERROR: Period is locked:', payment_date);
      return new Response(
        JSON.stringify({ 
          error: 'Period is locked',
          message: 'Cannot create payments in a locked period. Please unlock the period first.' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar contas com retry
    const { data: accounts, error: accError } = await withRetry(
      () => supabaseClient
        .from('accounts')
        .select('id, type, name')
        .in('id', [credit_account_id, debit_account_id])
        .eq('user_id', user.id)
    );

    if (accError || !accounts || accounts.length !== 2) {
      return new Response(JSON.stringify({ error: 'Invalid accounts' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const creditAcc = accounts.find(a => a.id === credit_account_id)!;
    const debitAcc = accounts.find(a => a.id === debit_account_id)!;

    // Inserir as duas transações vinculadas com retry
    // 1) Saída da conta bancária (expense, valor NEGATIVO para reduzir saldo)
    const { data: debitTx, error: debitErr } = await withRetry(
      () => supabaseClient
        .from('transactions')
        .insert({
          user_id: user.id,
          description: description || `Pagamento Fatura ${creditAcc.name}`,
          amount: -Math.abs(amount), // NEGATIVO para expense (sai dinheiro)
          date: payment_date,
          type: 'expense',
          category_id: null,
          account_id: debit_account_id,
          status: 'completed',
        })
        .select()
        .single()
    );

    if (debitErr) {
      console.error('[atomic-pay-bill] ERROR: debit insert failed:', debitErr);
      throw debitErr;
    }

    // 2) Entrada no cartão (income, valor POSITIVO para reduzir dívida) com retry
    const { data: creditTx, error: creditErr } = await withRetry(
      () => supabaseClient
        .from('transactions')
        .insert({
          user_id: user.id,
          description: description || `Pagamento Recebido de ${debitAcc.name}`,
          amount: Math.abs(amount), // POSITIVO para income (reduz dívida)
          date: payment_date,
          type: 'income',
          category_id: null,
          account_id: credit_account_id,
          linked_transaction_id: debitTx.id,
          status: 'completed',
        })
        .select()
        .single()
    );

    if (creditErr) {
      console.error('[atomic-pay-bill] ERROR: credit insert failed:', creditErr);
      await supabaseClient.from('transactions').delete().eq('id', debitTx.id);
      throw creditErr;
    }

    // Vincular a primeira
    await supabaseClient.from('transactions').update({ linked_transaction_id: creditTx.id }).eq('id', debitTx.id);

    // Criar journal_entries (débito na liability, crédito no asset)
    const { data: coa } = await supabaseClient
      .from('chart_of_accounts')
      .select('id, code, category')
      .eq('user_id', user.id);

    if (coa && coa.length > 0) {
      const liabilityCard = coa.find(a => a.code === '2.01.01')?.id; // Cartões de Crédito
      
      // Mapear conta bancária que está pagando
      let assetAccountId: string | undefined;
      if (debitAcc.type === 'checking') {
        assetAccountId = coa.find(a => a.code === '1.01.02')?.id;
      } else if (debitAcc.type === 'savings') {
        assetAccountId = coa.find(a => a.code === '1.01.03')?.id;
      } else if (debitAcc.type === 'investment') {
        assetAccountId = coa.find(a => a.code === '1.01.04')?.id;
      }

      // Fallback para primeira conta de ativo
      if (!assetAccountId) {
        assetAccountId = coa.find(a => a.code?.startsWith('1.01.'))?.id;
      }

      if (liabilityCard && assetAccountId) {
        await supabaseClient.from('journal_entries').insert([
          {
            user_id: user.id,
            transaction_id: creditTx.id,
            account_id: liabilityCard,
            entry_type: 'debit',
            amount: Math.abs(amount),
            description: creditTx.description,
            entry_date: payment_date,
          },
          {
            user_id: user.id,
            transaction_id: debitTx.id,
            account_id: assetAccountId,
            entry_type: 'credit',
            amount: Math.abs(amount),
            description: debitTx.description,
            entry_date: payment_date,
          }
        ]);
      }
    }

    // Recalcular saldos
    const { data: debitBal, error: debitBalErr } = await supabaseClient.rpc('recalculate_account_balance', { p_account_id: debit_account_id });
    if (debitBalErr) {
      console.error('[atomic-pay-bill] ERROR: debit balance recalc failed:', debitBalErr);
      throw debitBalErr;
    }

    const { data: creditBal, error: creditBalErr } = await supabaseClient.rpc('recalculate_account_balance', { p_account_id: credit_account_id });
    if (creditBalErr) {
      console.error('[atomic-pay-bill] ERROR: credit balance recalc failed:', creditBalErr);
      throw creditBalErr;
    }

    return new Response(JSON.stringify({
      debit_tx: debitTx,
      credit_tx: creditTx,
      debit_balance: debitBal?.[0],
      credit_balance: creditBal?.[0],
      success: true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[atomic-pay-bill] ERROR:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
