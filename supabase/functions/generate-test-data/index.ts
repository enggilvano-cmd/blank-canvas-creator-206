import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { GenerateTestDataInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';
import { getNowInUserTimezone, toUserTimezone, formatDateString, addYears } from '../_shared/timezone.ts';

interface GenerateTestDataRequest {
  transactionCount?: number;
  startDate?: string;
  endDate?: string;
  clearExisting?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting - Lenient para operações administrativas
    const rateLimitResponse = await rateLimiters.lenient.middleware(req, user.id);
    if (rateLimitResponse) {
      console.warn('[generate-test-data] WARN: Rate limit exceeded for user:', user.id);
      return rateLimitResponse;
    }

    // Parse e validar input com Zod
    const body = await req.json();

    const validation = validateWithZod(GenerateTestDataInputSchema, body);
    if (!validation.success) {
      console.error('[generate-test-data] ERROR: Validation failed:', validation.errors);
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const transactionCount = validation.data.transactionCount || 1000;
    const nowInUserTz = getNowInUserTimezone();
    const oneYearAgo = addYears(nowInUserTz, -1);
    const startDate = validation.data.startDate || formatDateString(oneYearAgo);
    const endDate = validation.data.endDate || formatDateString(nowInUserTz);
    const clearExisting = validation.data.clearExisting || false;

    // Logger estruturado
    const logger = {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      error: (msg: string, error?: unknown) => console.error(`[ERROR] ${msg}`, error || ''),
    };
    
    logger.info(`Generating ${transactionCount} test transactions for user ${user.id}`);

    // 1. Limpar dados existentes se solicitado com retry
    if (clearExisting) {
      logger.info('Clearing existing test data...');
      const { error: deleteError } = await withRetry(
        () => supabase
          .from('transactions')
          .delete()
          .eq('user_id', user.id)
          .like('description', 'TEST:%')
      );
      
      if (deleteError) {
        console.error('Error clearing test data:', deleteError);
      }
    }

    // 2. Buscar contas e categorias do usuário com retry
    const { data: accounts, error: accountsError } = await withRetry(
      () => supabase
        .from('accounts')
        .select('id, type')
        .eq('user_id', user.id)
    );

    if (accountsError || !accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No accounts found. Please create at least one account first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: categories, error: categoriesError } = await withRetry(
      () => supabase
        .from('categories')
        .select('id, type')
        .eq('user_id', user.id)
    );

    if (categoriesError || !categories || categories.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No categories found. Please create at least one category first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Gerar transações em lotes
    const batchSize = 100;
    const batches = Math.ceil(transactionCount / batchSize);
    let totalCreated = 0;
    const errors: Array<{ batch: number; error: string }> = [];

    const startTime = Date.now();

    for (let batch = 0; batch < batches; batch++) {
      const currentBatchSize = Math.min(batchSize, transactionCount - totalCreated);
      const transactions = [];

      for (let i = 0; i < currentBatchSize; i++) {
        const transactionIndex = batch * batchSize + i;
        
        // Distribuir datas uniformemente entre startDate e endDate (timezone-aware)
        const startDateObj = toUserTimezone(startDate);
        const endDateObj = toUserTimezone(endDate);
        const dateRange = endDateObj.getTime() - startDateObj.getTime();
        const randomDate = new Date(startDateObj.getTime() + Math.random() * dateRange);
        const date = formatDateString(randomDate);

        // Determinar tipo de transação (60% despesa, 30% receita, 10% transferência)
        const random = Math.random();
        let type: 'income' | 'expense' | 'transfer';
        if (random < 0.6) {
          type = 'expense';
        } else if (random < 0.9) {
          type = 'income';
        } else {
          type = 'transfer';
        }

        // Selecionar conta aleatória
        const account = accounts[Math.floor(Math.random() * accounts.length)];

        // Selecionar categoria apropriada para o tipo
        const appropriateCategories = categories.filter(
          c => c.type === type || c.type === 'both'
        );
        const category = appropriateCategories.length > 0
          ? appropriateCategories[Math.floor(Math.random() * appropriateCategories.length)]
          : categories[0];

        // Gerar valor (maioria entre 10-500, alguns outliers até 5000)
        const amount = Math.random() < 0.9
          ? Math.floor(Math.random() * 490 + 10)
          : Math.floor(Math.random() * 4500 + 500);

        // Status: 80% completed, 20% pending
        const status = Math.random() < 0.8 ? 'completed' : 'pending';

        // Descrições variadas
        const descriptions = [
          'Supermercado', 'Restaurante', 'Uber', 'Netflix', 'Academia',
          'Farmácia', 'Shopping', 'Gasolina', 'Internet', 'Luz',
          'Água', 'Telefone', 'Aluguel', 'Salário', 'Freelance',
          'Investimento', 'Pagamento', 'Compra Online', 'Manutenção', 'Serviços'
        ];
        const description = `TEST: ${descriptions[Math.floor(Math.random() * descriptions.length)]} #${transactionIndex}`;

        transactions.push({
          user_id: user.id,
          description,
          amount,
          date,
          type,
          category_id: category.id,
          account_id: account.id,
          status,
        });
      }

      // Inserir lote com retry
      const { data: inserted, error: insertError } = await withRetry(
        () => supabase
          .from('transactions')
          .insert(transactions)
          .select('id')
      );

      if (insertError) {
        console.error(`Error inserting batch ${batch}:`, insertError);
        errors.push({ batch, error: insertError.message });
      } else {
        totalCreated += inserted?.length || 0;
      }

      // Log progresso
      logger.info(`Progress: ${totalCreated}/${transactionCount} transactions created`);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // 4. Atualizar estatísticas do PostgreSQL
    logger.info('Running ANALYZE on transactions table...');
    // Nota: ANALYZE precisa ser executado via RPC ou SQL direto
    // Para Edge Functions, o usuário pode executar manualmente

    // 5. Buscar estatísticas finais com retry
    const { count: finalCount } = await withRetry(
      () => supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
    );

    return new Response(
      JSON.stringify({
        success: true,
        created: totalCreated,
        errors: errors.length,
        duration: `${duration.toFixed(2)}s`,
        rate: `${(totalCreated / duration).toFixed(0)} transactions/second`,
        totalTransactions: finalCount || 0,
        message: `Successfully created ${totalCreated} test transactions in ${duration.toFixed(2)}s. Please run ANALYZE transactions; in SQL Editor for optimal index performance.`,
        errorDetails: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating test data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
