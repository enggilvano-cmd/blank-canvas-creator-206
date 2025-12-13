import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { corsHeaders } from '../_shared/cors.ts'
import { withRetry } from '../_shared/retry.ts';
import { getNowInUserTimezone, createDateInUserTimezone, formatDateString } from '../_shared/timezone.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface FixedTransaction {
  id: string
  user_id: string
  description: string
  amount: number
  date: string
  type: 'income' | 'expense'
  category_id: string | null
  account_id: string
  parent_transaction_id: string | null
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify CRON_SECRET for scheduled job authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('X-Cron-Secret');
    
    // Logger estruturado
    const logger = {
      info: (msg: string, data?: unknown) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, error?: unknown) => console.error(`[ERROR] ${msg}`, error || ''),
      warn: (msg: string, data?: unknown) => console.warn(`[WARN] ${msg}`, data || ''),
    };

    if (cronSecret && providedSecret !== cronSecret) {
      logger.warn('Unauthorized access attempt - invalid CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Starting fixed transactions renewal for next year...')

    // Initialize Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Buscar todas as transações fixas principais (is_fixed = true e sem parent) com retry
    const { data: fixedTransactions, error: fetchError } = await withRetry(
      () => supabase
        .from('transactions')
        .select('*')
        .eq('is_fixed', true)
        .is('parent_transaction_id', null)
        .neq('type', 'transfer')
    );

    if (fetchError) {
      console.error('Error fetching fixed transactions:', fetchError)
      throw fetchError
    }

    if (!fixedTransactions || fixedTransactions.length === 0) {
      logger.info('No fixed transactions found to renew');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No fixed transactions to renew',
          generated: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    logger.info(`Found ${fixedTransactions.length} fixed transactions to renew`)

    let totalGenerated = 0
    const nowInUserTz = getNowInUserTimezone();
    const nextYear = nowInUserTz.getFullYear() + 1

    // Para cada transação fixa, gerar 12 ocorrências para o próximo ano
    for (const transaction of fixedTransactions as FixedTransaction[]) {
      try {
        // Parse da data original para obter o dia do mês
        const originalDate = new Date(transaction.date)
        const dayOfMonth = originalDate.getDate()

        logger.info(`Processing fixed transaction: ${transaction.description} (day ${dayOfMonth})`);

        // Gerar transações para todos os 12 meses do próximo ano
        const transactionsToGenerate: Record<string, unknown>[] = []
        
        for (let month = 0; month < 12; month++) {
          const nextDate = createDateInUserTimezone(nextYear, month, dayOfMonth)
          
          // Ajustar para o dia correto do mês
          const targetMonth = nextDate.getMonth()
          nextDate.setDate(dayOfMonth)
          
          // Se o mês mudou (ex: 31 de janeiro -> 3 de março), ajustar para o último dia do mês anterior
          if (nextDate.getMonth() !== targetMonth) {
            nextDate.setDate(0)
          }

          transactionsToGenerate.push({
            user_id: transaction.user_id,
            description: transaction.description,
            amount: transaction.amount,
            date: formatDateString(nextDate),
            type: transaction.type,
            category_id: transaction.category_id,
            account_id: transaction.account_id,
            status: 'pending',
            is_fixed: false,
            parent_transaction_id: transaction.id
          })
        }

        // Inserir as 12 novas transações com retry
        const { error: insertError } = await withRetry(
          () => supabase
            .from('transactions')
            .insert(transactionsToGenerate)
        );

        if (insertError) {
          console.error(`Error inserting transactions for ${transaction.description}:`, insertError)
          continue
        }

        totalGenerated += transactionsToGenerate.length
        logger.info(`Generated ${transactionsToGenerate.length} transactions for ${transaction.description}`);

      } catch (transactionError) {
        console.error(`Error processing transaction ${transaction.id}:`, transactionError)
        continue
      }
    }

    logger.info(`Successfully generated ${totalGenerated} transactions for ${nextYear}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Generated ${totalGenerated} transactions for year ${nextYear}`,
        generated: totalGenerated,
        year: nextYear,
        processed: fixedTransactions.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in renew-fixed-transactions:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
