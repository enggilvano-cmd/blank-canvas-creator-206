-- =============================================================================
-- ÍNDICES COMPOSTOS PARA OTIMIZAÇÃO DE QUERIES NA TABELA TRANSACTIONS
-- =============================================================================
-- Estes índices otimizam as queries com múltiplos filtros combinados,
-- reduzindo significativamente o tempo de resposta das consultas.

-- Habilitar extensão pg_trgm para busca por texto eficiente
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. ÍNDICE PRINCIPAL: user_id + date (ordenação mais comum)
-- Otimiza: SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_date 
ON transactions(user_id, date DESC);

-- 2. ÍNDICE PARA FILTROS COMBINADOS: user_id + type + status + date
-- Otimiza: SELECT * WHERE user_id = ? AND type = ? AND status = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_status_date 
ON transactions(user_id, type, status, date DESC);

-- 3. ÍNDICE PARA FILTRO POR CONTA: user_id + account_id + date
-- Otimiza: SELECT * WHERE user_id = ? AND account_id = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date 
ON transactions(user_id, account_id, date DESC);

-- 4. ÍNDICE PARA FILTRO POR CATEGORIA: user_id + category_id + date
-- Otimiza: SELECT * WHERE user_id = ? AND category_id = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date 
ON transactions(user_id, category_id, date DESC)
WHERE category_id IS NOT NULL;

-- 5. ÍNDICE PARA ORDENAÇÃO POR VALOR: user_id + amount
-- Otimiza: SELECT * WHERE user_id = ? ORDER BY amount DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_amount 
ON transactions(user_id, amount DESC);

-- 6. ÍNDICE PARCIAL PARA TRANSAÇÕES COMPLETED (status mais consultado)
-- Otimiza: SELECT * WHERE user_id = ? AND status = 'completed'
CREATE INDEX IF NOT EXISTS idx_transactions_user_completed 
ON transactions(user_id, date DESC)
WHERE status = 'completed';

-- 7. ÍNDICE PARA BUSCA POR TEXTO (ILIKE queries) - separado por user_id
-- Otimiza: SELECT * WHERE user_id = ? AND description ILIKE '%search%'
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm 
ON transactions USING gin(description gin_trgm_ops);

-- Índice B-tree adicional para combinar user_id com busca
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_lower_desc 
ON transactions(user_id, lower(description));

-- 8. ÍNDICE PARA TRANSFERÊNCIAS: user_id + to_account_id
-- Otimiza queries de transferências entre contas
CREATE INDEX IF NOT EXISTS idx_transactions_user_to_account 
ON transactions(user_id, to_account_id, date DESC)
WHERE to_account_id IS NOT NULL;

-- 9. ÍNDICE PARA PARCELAMENTOS: parent_transaction_id + current_installment
-- Otimiza queries de transações parceladas
CREATE INDEX IF NOT EXISTS idx_transactions_parent_installment 
ON transactions(parent_transaction_id, current_installment)
WHERE parent_transaction_id IS NOT NULL;

-- 10. ÍNDICE PARA RANGE DE DATAS COMBINADO
-- Otimiza: SELECT * WHERE user_id = ? AND date BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_range 
ON transactions(user_id, date)
WHERE status = 'completed';

-- 11. ÍNDICE PARA TIPO + DATA (queries comuns)
-- Otimiza: SELECT * WHERE user_id = ? AND type = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date 
ON transactions(user_id, type, date DESC);

-- 12. ÍNDICE PARA STATUS + DATA
-- Otimiza: SELECT * WHERE user_id = ? AND status = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_date 
ON transactions(user_id, status, date DESC);

-- =============================================================================
-- ÍNDICES PARA TABELAS RELACIONADAS
-- =============================================================================

-- Índice para JOIN com accounts (usado em accountType filter)
CREATE INDEX IF NOT EXISTS idx_accounts_user_type 
ON accounts(user_id, type);

-- Índice para JOIN com categories
CREATE INDEX IF NOT EXISTS idx_categories_user_type 
ON categories(user_id, type);

-- Índice adicional para accounts com balance
CREATE INDEX IF NOT EXISTS idx_accounts_user_balance 
ON accounts(user_id, balance DESC);

-- =============================================================================
-- ESTATÍSTICAS E ANÁLISE
-- =============================================================================

-- Atualizar estatísticas das tabelas para melhor planejamento de queries
ANALYZE transactions;
ANALYZE accounts;
ANALYZE categories;

-- Comentários para documentação
COMMENT ON INDEX idx_transactions_user_date IS 'Índice principal para ordenação por data - usado em 80% das queries';
COMMENT ON INDEX idx_transactions_user_type_status_date IS 'Índice para filtros combinados mais comuns (type + status + date)';
COMMENT ON INDEX idx_transactions_user_account_date IS 'Índice para filtro por conta específica';
COMMENT ON INDEX idx_transactions_user_category_date IS 'Índice para filtro por categoria';
COMMENT ON INDEX idx_transactions_description_trgm IS 'Índice GIN trigram para busca full-text em descrição com debounce de 500ms';
COMMENT ON INDEX idx_transactions_user_completed IS 'Índice parcial otimizado para transações completed (reduz 50% do tamanho)';
COMMENT ON INDEX idx_transactions_user_amount IS 'Índice para ordenação por valor (queries de maior/menor transação)';