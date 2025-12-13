import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { withRetry } from '../_shared/retry.ts';
import { getNowInUserTimezone, createDateInUserTimezone, formatDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FixedTransaction {
  id: string
  description: string
  amount: number
  date: string
  type: 'income' | 'expense'
  category_id: string | null
  account_id: string
  user_id: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Logger estruturado ao invés de console.log
    const logger = {
      info: (msg: string, data?: unknown) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, error?: unknown) => console.error(`[ERROR] ${msg}`, error || ''),
      warn: (msg: string, data?: unknown) => console.warn(`[WARN] ${msg}`, data || ''),
    };
    
    logger.info('Starting yearly fixed transactions generation');

    // Rate limiting - Lenient para jobs automatizados
    const identifier = req.headers.get('x-job-id') || 'fixed-job';
    const rateLimitResponse = await rateLimiters.lenient.middleware(req, identifier);
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded');
      return rateLimitResponse;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Buscar todas as transações fixas (parent transactions) com retry
    const { data: fixedTransactions, error: fetchError } = await withRetry(
      () => supabase
        .from('transactions')
        .select('*')
        .eq('is_fixed', true)
        .neq('type', 'transfer')
    )

    if (fetchError) {
      logger.error('Failed to fetch fixed transactions:', fetchError);
      throw fetchError;
    }

    if (!fixedTransactions || fixedTransactions.length === 0) {
      logger.info('No fixed transactions found');
      return new Response(
        JSON.stringify({ message: 'No fixed transactions found', generated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info(`Found ${fixedTransactions.length} fixed transactions`);

    let totalGenerated = 0

    // Para cada transação fixa, gerar 12 meses do próximo ano
    for (const fixedTx of fixedTransactions as FixedTransaction[]) {
      const startDate = new Date(fixedTx.date)
      const dayOfMonth = startDate.getDate()
      
      // Ano que será gerado (próximo ano a partir de hoje no timezone do usuário)
      const nowInUserTz = getNowInUserTimezone();
      const nextYear = nowInUserTz.getFullYear() + 1
      
      const futureTransactions: Record<string, unknown>[] = []
      
      // Gerar todos os 12 meses do próximo ano
      for (let month = 0; month < 12; month++) {
        const futureDate = createDateInUserTimezone(nextYear, month, dayOfMonth)
        
        // Ajustar para o dia correto do mês
        const targetMonth = futureDate.getMonth()
        futureDate.setDate(dayOfMonth)
        
        // Se o mês mudou (ex: 31 de janeiro -> 3 de março), ajustar para o último dia do mês anterior
        if (futureDate.getMonth() !== targetMonth) {
          futureDate.setDate(0)
        }
        
        const dateString = formatDateString(futureDate)
        const year = futureDate.getFullYear()
        const monthStr = String(futureDate.getMonth() + 1).padStart(2, '0')
        
        futureTransactions.push({
          user_id: fixedTx.user_id,
          description: fixedTx.description,
          amount: fixedTx.amount,
          date: dateString,
          type: fixedTx.type,
          category_id: fixedTx.category_id,
          account_id: fixedTx.account_id,
          status: 'pending',
          is_fixed: false,
          parent_transaction_id: fixedTx.id,
          invoice_month: `${year}-${monthStr}`,
        })
      }

      // Inserir as transações futuras com retry
      const { error: insertError } = await withRetry(
        () => supabase
          .from('transactions')
          .insert(futureTransactions)
      );

      if (insertError) {
        console.error(`[generate-fixed] ERROR: Failed for ${fixedTx.id}:`, insertError);
        continue;
      }

      totalGenerated += futureTransactions.length;
      logger.info(`Generated ${futureTransactions.length} transactions for ${fixedTx.description}`);
    }

    logger.info(`Total transactions generated: ${totalGenerated}`);

    return new Response(
      JSON.stringify({
        message: 'Fixed transactions generated successfully',
        generated: totalGenerated,
        fixedTransactionsProcessed: fixedTransactions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('[generate-fixed] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
