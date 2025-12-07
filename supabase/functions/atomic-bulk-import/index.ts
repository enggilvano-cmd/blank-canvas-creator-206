import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Schema para uma transação individual no bulk import
 */
const BulkTransactionSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid(),
  status: z.enum(['pending', 'completed']),
  invoice_month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  installments: z.number().int().min(1).max(120).nullable().optional(),
  current_installment: z.number().int().min(1).max(120).nullable().optional(),
});

/**
 * Schema para transferência no bulk import
 */
const BulkTransferSchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outgoing_description: z.string().trim().max(200).optional(),
  incoming_description: z.string().trim().max(200).optional(),
  status: z.enum(['pending', 'completed']),
});

/**
 * Schema principal do bulk import
 */
const BulkImportSchema = z.object({
  transactions: z.array(BulkTransactionSchema).max(500).optional(),
  transfers: z.array(BulkTransferSchema).max(100).optional(),
  delete_ids: z.array(z.string().uuid()).max(500).optional(),
});

type BulkTransaction = z.infer<typeof BulkTransactionSchema>;
type BulkTransfer = z.infer<typeof BulkTransferSchema>;

function logEvent(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify({ timestamp, level, function: 'atomic-bulk-import', message, context })
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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

    // Verificar autenticação
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      logEvent('error', 'Auth failed', { userError });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();

    // Validação Zod
    const validation = BulkImportSchema.safeParse(body);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach(issue => {
        errors[issue.path.join('.')] = issue.message;
      });
      logEvent('error', 'Validation failed', { errors });
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transactions = [], transfers = [], delete_ids = [] } = validation.data;

    logEvent('info', 'Starting bulk import', {
      userId: user.id,
      transactionsCount: transactions.length,
      transfersCount: transfers.length,
      deleteCount: delete_ids.length,
    });

    // Resultados
    const results = {
      deleted: 0,
      transactions_created: 0,
      transfers_created: 0,
      errors: [] as { index: number; type: string; error: string }[],
    };

    // 1. Deletar transações marcadas para substituição (em batch)
    if (delete_ids.length > 0) {
      logEvent('info', 'Deleting transactions to replace', { count: delete_ids.length });
      
      const { error: deleteError, count } = await supabaseClient
        .from('transactions')
        .delete()
        .in('id', delete_ids)
        .eq('user_id', user.id);

      if (deleteError) {
        logEvent('error', 'Delete failed', { deleteError });
      } else {
        results.deleted = count || delete_ids.length;
      }
    }

    // 2. Verificar/inicializar plano de contas
    const { data: chartAccounts } = await supabaseClient
      .from('chart_of_accounts')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (!chartAccounts || chartAccounts.length === 0) {
      await supabaseClient.rpc('initialize_chart_of_accounts', { p_user_id: user.id });
    }

    // 3. Processar transações em batch usando RPC
    if (transactions.length > 0) {
      logEvent('info', 'Processing transactions batch', { count: transactions.length });

      // Preparar dados para a função RPC
      const transactionsJson = transactions.map((tx, index) => ({
        idx: index,
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        category_id: tx.category_id || null,
        account_id: tx.account_id,
        status: tx.status,
        invoice_month: tx.invoice_month || null,
        installments: tx.installments || null,
        current_installment: tx.current_installment || null,
      }));

      const { data: txResults, error: txError } = await supabaseClient.rpc('bulk_create_transactions', {
        p_user_id: user.id,
        p_transactions: transactionsJson,
      });

      if (txError) {
        logEvent('error', 'Bulk transactions RPC failed', { txError });
        // Fallback: processar individualmente
        for (let i = 0; i < transactions.length; i++) {
          const tx = transactions[i];
          try {
            const { error } = await supabaseClient.rpc('atomic_create_transaction', {
              p_user_id: user.id,
              p_description: tx.description,
              p_amount: tx.amount,
              p_date: tx.date,
              p_type: tx.type,
              p_category_id: tx.category_id || null,
              p_account_id: tx.account_id,
              p_status: tx.status,
              p_invoice_month: tx.invoice_month || null,
              p_invoice_month_overridden: !!tx.invoice_month,
            });

            if (error) {
              results.errors.push({ index: i, type: 'transaction', error: error.message });
            } else {
              results.transactions_created++;
            }
          } catch (err) {
            results.errors.push({ index: i, type: 'transaction', error: String(err) });
          }
        }
      } else if (txResults) {
        // Processar resultados do bulk
        for (const result of txResults) {
          if (result.success) {
            results.transactions_created++;
          } else {
            results.errors.push({ index: result.idx, type: 'transaction', error: result.error_message });
          }
        }
      }
    }

    // 4. Processar transferências em batch
    if (transfers.length > 0) {
      logEvent('info', 'Processing transfers batch', { count: transfers.length });

      const transfersJson = transfers.map((tf, index) => ({
        idx: index,
        from_account_id: tf.from_account_id,
        to_account_id: tf.to_account_id,
        amount: tf.amount,
        date: tf.date,
        outgoing_description: tf.outgoing_description || 'Transferência enviada',
        incoming_description: tf.incoming_description || 'Transferência recebida',
        status: tf.status,
      }));

      const { data: tfResults, error: tfError } = await supabaseClient.rpc('bulk_create_transfers', {
        p_user_id: user.id,
        p_transfers: transfersJson,
      });

      if (tfError) {
        logEvent('error', 'Bulk transfers RPC failed', { tfError });
        // Fallback: processar individualmente
        for (let i = 0; i < transfers.length; i++) {
          const tf = transfers[i];
          try {
            const { error } = await supabaseClient.rpc('atomic_create_transfer', {
              p_user_id: user.id,
              p_from_account_id: tf.from_account_id,
              p_to_account_id: tf.to_account_id,
              p_amount: tf.amount,
              p_date: tf.date,
              p_outgoing_description: tf.outgoing_description || 'Transferência enviada',
              p_incoming_description: tf.incoming_description || 'Transferência recebida',
              p_status: tf.status,
            });

            if (error) {
              results.errors.push({ index: i, type: 'transfer', error: error.message });
            } else {
              results.transfers_created++;
            }
          } catch (err) {
            results.errors.push({ index: i, type: 'transfer', error: String(err) });
          }
        }
      } else if (tfResults) {
        for (const result of tfResults) {
          if (result.success) {
            results.transfers_created++;
          } else {
            results.errors.push({ index: result.idx, type: 'transfer', error: result.error_message });
          }
        }
      }
    }

    const elapsedMs = Date.now() - startTime;
    const totalCreated = results.transactions_created + results.transfers_created * 2;
    const totalRequested = transactions.length + transfers.length * 2;

    logEvent('info', 'Bulk import completed', {
      userId: user.id,
      elapsedMs,
      deleted: results.deleted,
      transactionsCreated: results.transactions_created,
      transfersCreated: results.transfers_created,
      errors: results.errors.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted: results.deleted,
        transactions_created: results.transactions_created,
        transfers_created: results.transfers_created,
        total_created: totalCreated,
        total_requested: totalRequested,
        errors: results.errors,
        elapsed_ms: elapsedMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logEvent('error', 'Unhandled exception', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
