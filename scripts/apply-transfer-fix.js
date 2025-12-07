import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function applyMigration() {
  try {
    console.log('📦 Lendo arquivo de migração...')
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20251207_fix_transfer_type_critical.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('🔧 Aplicando migração crítica...')
    const { error } = await supabase.rpc('exec_sql', { 
      sql: migrationSQL 
    })

    if (error) {
      console.error('❌ Erro ao aplicar migração:', error)
      process.exit(1)
    }

    console.log('✅ Migração aplicada com sucesso!')
    console.log('✅ Transferências agora usam tipo "transfer" em vez de "expense"')
    process.exit(0)
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

applyMigration()
