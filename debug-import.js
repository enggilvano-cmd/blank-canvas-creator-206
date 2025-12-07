// Debug script para testar a importação de transações
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabase = createClient(
  'https://sdberrkfwoozezletfuq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYmVycmtmd29vemV6bGV0ZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc1NzY4NTEsImV4cCI6MjA0MzE1Mjg1MX0.GBrnHlmVNsZyOCr4QY7uWUlBb6pXXShqGhEDOtXOvGc'
);

async function testImport() {
  console.log('🔍 Testando importação de transações...');

  try {
    // 1. Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ Erro de autenticação:', authError);
      return;
    }

    console.log('✅ Usuário autenticado:', user.id);

    // 2. Buscar contas disponíveis
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, type')
      .eq('user_id', user.id)
      .limit(1);

    if (accountsError || !accounts || accounts.length === 0) {
      console.error('❌ Erro ao buscar contas ou nenhuma conta encontrada:', accountsError);
      return;
    }

    console.log('✅ Conta encontrada:', accounts[0]);

    // 3. Testar transação simples
    const testTransaction = {
      description: 'Teste de importação debug',
      amount: 10000, // 100.00 em centavos
      date: '2024-12-04',
      type: 'expense',
      category_id: null,
      account_id: accounts[0].id,
      status: 'completed'
    };

    console.log('📤 Enviando transação de teste:', testTransaction);

    const result = await supabase.functions.invoke('atomic-transaction', {
      body: {
        transaction: testTransaction
      }
    });

    if (result.error) {
      console.error('❌ Erro na função edge:', result.error);
      console.error('💡 Detalhes completos:', JSON.stringify(result.error, null, 2));
    } else {
      console.log('✅ Transação criada com sucesso:', result.data);
    }

  } catch (error) {
    console.error('❌ Erro inesperado:', error);
  }
}

// Executar teste
testImport();