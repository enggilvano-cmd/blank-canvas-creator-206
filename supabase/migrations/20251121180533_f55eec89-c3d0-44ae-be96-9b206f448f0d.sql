-- ============================================
-- ÍNDICES DE OTIMIZAÇÃO PARA PAGINAÇÃO
-- ============================================

-- Índice composto principal para paginação de transações
-- Otimiza queries: WHERE user_id = X ORDER BY date DESC, created_at DESC
-- Beneficia: useTransactions hook com paginação
CREATE INDEX IF NOT EXISTS idx_transactions_pagination 
ON public.transactions (user_id, date DESC, created_at DESC);

-- Índice para contagem rápida de transações por usuário
-- Otimiza queries: SELECT COUNT(*) FROM transactions WHERE user_id = X
CREATE INDEX IF NOT EXISTS idx_transactions_user_count 
ON public.transactions (user_id) 
INCLUDE (id);

-- Índice para queries filtradas por tipo + usuário
-- Otimiza queries: WHERE user_id = X AND type = Y ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date 
ON public.transactions (user_id, type, date DESC, created_at DESC);

-- Índice para queries filtradas por status + usuário
-- Otimiza queries: WHERE user_id = X AND status = Y ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_date 
ON public.transactions (user_id, status, date DESC, created_at DESC);

-- Índice para queries filtradas por conta + usuário
-- Otimiza queries: WHERE user_id = X AND account_id = Y ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date 
ON public.transactions (user_id, account_id, date DESC, created_at DESC);

-- Índice para busca de transações parceladas
-- Otimiza queries: WHERE parent_transaction_id = X
CREATE INDEX IF NOT EXISTS idx_transactions_parent 
ON public.transactions (parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;

-- Índice para busca de transações recorrentes
-- Otimiza queries: WHERE user_id = X AND is_recurring = true
CREATE INDEX IF NOT EXISTS idx_transactions_recurring 
ON public.transactions (user_id, is_recurring) 
WHERE is_recurring = true;

-- ============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================

COMMENT ON INDEX idx_transactions_pagination IS 
'Índice principal para paginação ordenada por data. Cobre 95% das queries do useTransactions hook.';

COMMENT ON INDEX idx_transactions_user_count IS 
'Índice otimizado para contagem rápida usando INCLUDE. Evita acesso à tabela principal.';

COMMENT ON INDEX idx_transactions_user_type_date IS 
'Índice para filtros por tipo de transação (income/expense/transfer). Usado em filtros do dashboard.';

COMMENT ON INDEX idx_transactions_user_status_date IS 
'Índice para filtros por status (pending/completed). Usado em relatórios e reconciliação.';

COMMENT ON INDEX idx_transactions_user_account_date IS 
'Índice para filtros por conta específica. Usado em detalhes de conta e extrato.';

-- ============================================
-- ANÁLISE DE PERFORMANCE
-- ============================================

-- Esta query pode ser executada para verificar o uso dos índices:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'transactions'
-- ORDER BY idx_scan DESC;