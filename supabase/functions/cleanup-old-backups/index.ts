import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
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
    // Verify CRON_SECRET for scheduled job authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('X-Cron-Secret');
    
    if (cronSecret && providedSecret !== cronSecret) {
      console.warn('[cleanup-old-backups] WARN: Unauthorized access attempt - invalid CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting backup cleanup...');

    // Calcular data limite (30 dias atrás)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    console.log(`Deleting backups older than: ${cutoffDate}`);

    // Buscar backups antigos com retry
    const { data: oldBackups, error: fetchError } = await withRetry(
      () => supabase
        .from('backup_history')
        .select('*')
        .lt('created_at', cutoffDate)
        .order('created_at', { ascending: true })
    );

    if (fetchError) {
      console.error('Error fetching old backups:', fetchError);
      throw fetchError;
    }

    if (!oldBackups || oldBackups.length === 0) {
      console.log('No old backups found to delete');
      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: 0,
          message: 'No backups to clean up',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${oldBackups.length} backups to delete`);

    let deletedFiles = 0;
    let deletedRecords = 0;
    const errors: Array<{ file_path: string; error: string }> = [];

    // Deletar cada backup
    for (const backup of oldBackups) {
      try {
        // Deletar arquivo do storage com retry
        const { error: storageError } = await withRetry(
          () => supabase.storage.from('backups').remove([backup.file_path])
        );

        if (storageError) {
          console.error(`Error deleting file ${backup.file_path}:`, storageError);
          errors.push({
            file_path: backup.file_path,
            error: storageError.message,
          });
          continue;
        }

        deletedFiles++;

        // Deletar registro do histórico com retry
        const { error: deleteError } = await withRetry(
          () => supabase.from('backup_history').delete().eq('id', backup.id)
        );

        if (deleteError) {
          console.error(`Error deleting record ${backup.id}:`, deleteError);
          errors.push({
            file_path: backup.file_path,
            error: deleteError.message,
          });
          continue;
        }

        deletedRecords++;

        console.log(`Successfully deleted backup: ${backup.file_path}`);
      } catch (error) {
        console.error(`Error processing backup ${backup.file_path}:`, error);
        errors.push({
          file_path: backup.file_path,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Calcular tamanho total liberado
    const totalSizeFreed = oldBackups.reduce((sum, backup) => sum + (backup.file_size || 0), 0);

    console.log(`Cleanup completed. Deleted ${deletedFiles} files and ${deletedRecords} records`);
    console.log(`Total space freed: ${(totalSizeFreed / 1024 / 1024).toFixed(2)} MB`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted_files: deletedFiles,
        deleted_records: deletedRecords,
        total_size_freed_mb: (totalSizeFreed / 1024 / 1024).toFixed(2),
        errors: errors.length > 0 ? errors : undefined,
        cutoff_date: cutoffDate,
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
