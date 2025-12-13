import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { withRetry } from '../_shared/retry.ts';
import { getNowInUserTimezone, formatInUserTimezone, addDays, addMonths, setTimeInUserTimezone } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackupSchedule {
  id: string;
  user_id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  last_backup_at: string | null;
  next_backup_at: string | null;
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

    // Verify CRON_SECRET for scheduled job authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('X-Cron-Secret');
    
    if (cronSecret && providedSecret !== cronSecret) {
      logger.warn('Unauthorized access attempt - invalid CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logger.info('Starting scheduled backup generation...');

    // Buscar agendamentos ativos que precisam de backup com retry
    const now = getNowInUserTimezone();
    const { data: schedules, error: schedulesError } = await withRetry(
      () => supabase
        .from('backup_schedules')
        .select('*')
        .eq('is_active', true)
        .or(`next_backup_at.is.null,next_backup_at.lte.${now.toISOString()}`)
    );

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError);
      throw schedulesError;
    }

    logger.info(`Found ${schedules?.length || 0} schedules to process`);

    const results = [];

    for (const schedule of schedules || []) {
      try {
        logger.info(`Processing backup for user ${schedule.user_id}`);
        
        // Buscar dados do usuário com retry
        const [accountsRes, categoriesRes, transactionsRes] = await Promise.all([
          withRetry(() => supabase.from('accounts').select('*').eq('user_id', schedule.user_id)),
          withRetry(() => supabase.from('categories').select('*').eq('user_id', schedule.user_id)),
          withRetry(() => supabase.from('transactions').select('*, accounts(name), categories(name)').eq('user_id', schedule.user_id)),
        ]);

        if (accountsRes.error || categoriesRes.error || transactionsRes.error) {
          throw new Error('Error fetching user data');
        }

        // Criar workbook Excel
        const wb = XLSX.utils.book_new();

        // Sheet de contas
        const accountsData = (accountsRes.data || []).map((acc) => ({
          Nome: acc.name,
          Tipo: acc.type,
          Saldo: acc.balance,
          Limite: acc.limit_amount || '',
          'Data Fechamento': acc.closing_date || '',
          'Data Vencimento': acc.due_date || '',
          Cor: acc.color,
        }));
        const accountsWs = XLSX.utils.json_to_sheet(accountsData);
        XLSX.utils.book_append_sheet(wb, accountsWs, 'Contas');

        // Sheet de categorias
        const categoriesData = (categoriesRes.data || []).map((cat) => ({
          Nome: cat.name,
          Tipo: cat.type,
          Cor: cat.color,
        }));
        const categoriesWs = XLSX.utils.json_to_sheet(categoriesData);
        XLSX.utils.book_append_sheet(wb, categoriesWs, 'Categorias');

        // Sheet de transações
        const transactionsData = (transactionsRes.data || []).map((tx) => ({
          Data: tx.date,
          Descrição: tx.description,
          Valor: tx.amount,
          Tipo: tx.type,
          Conta: tx.accounts?.name || '',
          Categoria: tx.categories?.name || '',
          Status: tx.status,
          'Mês Fatura': tx.invoice_month || '',
          Parcelas: tx.installments || '',
          'Parcela Atual': tx.current_installment || '',
        }));
        const transactionsWs = XLSX.utils.json_to_sheet(transactionsData);
        XLSX.utils.book_append_sheet(wb, transactionsWs, 'Transações');

        // Converter para buffer
        const wbout = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Salvar no storage
        const timestamp = formatInUserTimezone(now, "yyyy-MM-dd'T'HH-mm-ss");
        const fileName = `${schedule.user_id}/backup-${timestamp}.xlsx`;

        const { error: uploadError } = await withRetry(
          () => supabase.storage
            .from('backups')
            .upload(fileName, wbout, {
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              upsert: false,
            })
        );

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        // Registrar no histórico com retry
        await withRetry(
          () => supabase.from('backup_history').insert({
            user_id: schedule.user_id,
            file_path: fileName,
            file_size: wbout.byteLength,
            backup_type: 'scheduled',
          })
        );

        // Calcular próximo backup
        const nextBackup = calculateNextBackup(schedule.frequency);

        // Atualizar agendamento com retry
        await withRetry(
          () => supabase
            .from('backup_schedules')
            .update({
              last_backup_at: now.toISOString(),
              next_backup_at: nextBackup.toISOString(),
            })
            .eq('id', schedule.id)
        );

        results.push({
          user_id: schedule.user_id,
          success: true,
          file_path: fileName,
        });

        logger.info(`Backup completed for user ${schedule.user_id}`);
      } catch (error) {
        console.error(`Error processing backup for user ${schedule.user_id}:`, error);
        results.push({
          user_id: schedule.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: schedules?.length || 0,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function calculateNextBackup(frequency: 'daily' | 'weekly' | 'monthly'): Date {
  let next = getNowInUserTimezone();
  
  switch (frequency) {
    case 'daily':
      next = addDays(next, 1);
      break;
    case 'weekly':
      next = addDays(next, 7);
      break;
    case 'monthly':
      next = addMonths(next, 1);
      break;
  }
  
  // Definir para 3:00 AM no timezone do usuário
  next = setTimeInUserTimezone(next, 3, 0, 0, 0);
  
  return next;
}
