-- Função para calcular totais agregados de transações com filtros
CREATE OR REPLACE FUNCTION get_transactions_totals(
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
RETURNS TABLE(
  total_income NUMERIC,
  total_expenses NUMERIC,
  balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_account_ids UUID[];
BEGIN
  -- Se filtro por tipo de conta, buscar IDs das contas
  IF p_account_type != 'all' THEN
    SELECT ARRAY_AGG(id)
    INTO v_account_ids
    FROM accounts
    WHERE user_id = p_user_id
      AND type::TEXT = p_account_type;
  END IF;

  -- Calcular totais com filtros aplicados
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' AND t.to_account_id IS NULL THEN t.amount 
      ELSE 0 
    END), 0) AS total_income,
    COALESCE(SUM(CASE 
      WHEN t.type = 'expense' AND t.to_account_id IS NULL THEN ABS(t.amount)
      ELSE 0 
    END), 0) AS total_expenses,
    COALESCE(SUM(CASE 
      WHEN t.to_account_id IS NULL THEN 
        CASE WHEN t.type = 'income' THEN t.amount ELSE -ABS(t.amount) END
      ELSE 0 
    END), 0) AS balance
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND (p_type = 'all' OR t.type::TEXT = p_type)
    AND (p_status = 'all' OR t.status::TEXT = p_status)
    AND (p_account_id = 'all' OR t.account_id::TEXT = p_account_id)
    AND (p_category_id = 'all' OR t.category_id::TEXT = p_category_id)
    AND (p_account_type = 'all' OR t.account_id = ANY(v_account_ids))
    AND (p_date_from IS NULL OR t.date >= p_date_from)
    AND (p_date_to IS NULL OR t.date <= p_date_to)
    AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%');
END;
$$;