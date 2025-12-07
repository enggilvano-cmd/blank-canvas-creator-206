import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração do Supabase - você precisa definir essas variáveis de ambiente
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos');
  console.error('Defina as variáveis de ambiente ou edite o arquivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    // Ler o arquivo de migração
    const migrationPath = join(__dirname, '../supabase/migrations/20251205_fix_transfers_in_totals.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Aplicando migração: 20251205_fix_transfers_in_totals.sql');
    console.log('🔄 Executando SQL...\n');

    // Executar o SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Se exec_sql não existir, tente executar diretamente
      console.log('⚠️  exec_sql não disponível, tentando abordagem alternativa...');
      console.log('\n⚠️  Por favor, aplique a migração manualmente:');
      console.log('1. Acesse o painel do Supabase');
      console.log('2. Vá para SQL Editor');
      console.log('3. Copie e cole o conteúdo de:');
      console.log('   supabase/migrations/20251205_fix_transfers_in_totals.sql');
      console.log('4. Execute o SQL\n');
      console.log('Conteúdo da migração:');
      console.log('='.repeat(80));
      console.log(sql);
      console.log('='.repeat(80));
      process.exit(1);
    }

    console.log('✅ Migração aplicada com sucesso!');
    console.log('\nAgora as transferências não serão mais contadas como despesas nos totais.');
    console.log('Atualize a página da aplicação para ver as mudanças.');
    
  } catch (error) {
    console.error('❌ Erro ao aplicar migração:', error.message);
    console.log('\n⚠️  Por favor, aplique a migração manualmente no painel do Supabase.');
    process.exit(1);
  }
}

applyMigration();
