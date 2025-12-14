#!/usr/bin/env bash
# ============================================================================
# TESTE RÁPIDO: Verificar se o erro PGRST203 foi resolvido
# ============================================================================
# 
# COMO EXECUTAR:
# 1. Abra o navegador no seu projeto
# 2. Pressione F12 (Developer Tools)
# 3. Vá para o Console
# 4. Cole o seguinte código JavaScript:
#
# ============================================================================

// ============================================================================
// TEST 1: Verificar se a função RPC está disponível
// ============================================================================
console.log('🔍 TEST 1: Verificando disponibilidade da função RPC...');

supabase.rpc('get_transactions_totals', {
  p_user_id: (await supabase.auth.getUser()).data.user.id,
  p_type: 'all',
  p_status: 'all',
  p_account_id: 'all',
  p_category_id: 'all',
  p_account_type: 'all',
  p_is_fixed: null,
  p_is_provision: null,
  p_date_from: null,
  p_date_to: null,
  p_search: null,
  p_invoice_month: 'all'
})
.then(({ data, error }) => {
  if (error) {
    console.error('❌ ERRO:', error);
    console.error('Código:', error.code);
    console.error('Mensagem:', error.message);
    
    if (error.code === 'PGRST203') {
      console.warn('⚠️  O erro PGRST203 AINDA EXISTE!');
      console.warn('Tente: Ctrl+Shift+R (hard refresh)');
    }
  } else {
    console.log('✅ SUCESSO! Totais recebidos:');
    console.table(data);
    console.log('🎉 O erro PGRST203 FOI RESOLVIDO!');
  }
})
.catch(err => {
  console.error('❌ Exceção:', err);
});

// ============================================================================
// TEST 2: Testar com filtros (is_fixed e is_provision)
// ============================================================================
console.log('\n🔍 TEST 2: Testando com filtros booleanos...');

const userId = (await supabase.auth.getUser()).data.user.id;

// Teste com is_fixed = true
supabase.rpc('get_transactions_totals', {
  p_user_id: userId,
  p_is_fixed: true,  // ← Este parâmetro causava conflito
  p_is_provision: false  // ← Este também
})
.then(({ data, error }) => {
  if (error) {
    console.error('❌ Erro com is_fixed=true:', error.message);
  } else {
    console.log('✅ is_fixed=true funciona:', data);
  }
})
.catch(err => {
  console.error('❌ Exceção:', err);
});

// ============================================================================
// TEST 3: Verificar logs na página
// ============================================================================
console.log('\n🔍 TEST 3: Verificando logs da aplicação...');
console.log('Procure por:');
console.log('  ✅ [INFO] Successfully subscribed to realtime changes');
console.log('  ✅ [INFO] Aggregated totals received: {...}');
console.log('');
console.log('NÃO deve haver:');
console.log('  ❌ [ERROR] RPC Error fetching aggregated totals: PGRST203');
console.log('  ❌ [ERROR] Could not choose the best candidate function');

// ============================================================================
// RESULTADO ESPERADO
// ============================================================================
/*
✅ TEST 1: Verificando disponibilidade da função RPC...
✅ SUCESSO! Totais recebidos:
┌──────────────┬──────────────┬─────────┐
│ total_income │ total_expenses │ balance │
├──────────────┼──────────────┼─────────┤
│    1000      │     500      │  500    │
└──────────────┴──────────────┴─────────┘
🎉 O erro PGRST203 FOI RESOLVIDO!

✅ TEST 2: Testando com filtros booleanos...
✅ is_fixed=true funciona: [...]

✅ TEST 3: Verificando logs da aplicação...
✅ [INFO] Successfully subscribed to realtime changes
✅ [INFO] Aggregated totals received: {income: 1000, expenses: 500, balance: 500}
*/

// ============================================================================
// SE AINDA TIVER ERRO PGRST203
// ============================================================================
// 1. Faça hard refresh: Ctrl+Shift+R
// 2. Limpe o cache:
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => {
  dbs.forEach(db => indexedDB.deleteDatabase(db.name));
});

// 3. Recarregue a página
location.reload();

// ============================================================================
