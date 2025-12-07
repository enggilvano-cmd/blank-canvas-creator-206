-- Corrigir sobrecarga de função get_transactions_totals
-- Remove todas as versões existentes e cria apenas uma versão canônica

-- Deletar todas as versões existentes da função
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, date, date, text);
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, date, date, text, text, text);

-- Criar versão única e definitiva da função
CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id UUID,
  p_type TEXT DEFAULT 'all',
  p_status TEXT DEFAULT 'all',
  p_account_id TEXT DEFAULT 'all',
  p_category_id TEXT DEFAULT 'all',
  p_account_type TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_income NUMERIC,
  total_expenses NUMERIC,
  balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      t.category_id,
      t.description,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- SEMPRE excluir transferências (baseado em to_account_id e linked_transaction_id)
      AND t.to_account_id IS NULL
      AND t.linked_transaction_id IS NULL
      -- Filtros de tipo
      AND (p_type = 'all' OR t.type::text = p_type)
      -- Filtros de status
      AND (p_status = 'all' OR t.status::text = p_status)
      -- Filtros de conta
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      -- Filtros de tipo de conta
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      -- Filtros de categoria
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      -- Filtros de período
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      -- Filtro de busca
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
  )
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as total_expenses,
    COALESCE(
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 
      0
    ) as balance
  FROM filtered_transactions;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Comentário explicativo
COMMENT ON FUNCTION public.get_transactions_totals IS 
'Calcula totais agregados (receitas, despesas e saldo) com base em filtros. 
SEMPRE exclui transações de transferência para evitar duplicação de valores.
Parâmetros na ordem: user_id, type, status, account_id, category_id, account_type, date_from, date_to, search';