-- Corrigir get_transactions_totals para excluir transações de transferência (baseado em to_account_id/linked_transaction_id)
CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id uuid,
  p_account_id text DEFAULT 'all',
  p_account_type text DEFAULT 'all',
  p_category_id text DEFAULT 'all',
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_type text DEFAULT 'all'
)
RETURNS TABLE(
  balance numeric,
  total_expenses numeric,
  total_income numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_account_ids uuid[];
BEGIN
  -- Se filtro por tipo de conta, buscar IDs das contas
  IF p_account_type <> 'all' THEN
    SELECT ARRAY_AGG(id)
    INTO v_account_ids
    FROM accounts
    WHERE user_id = p_user_id
      AND type::text = p_account_type;
  END IF;

  -- Calcular totais com filtros aplicados, SEMPRE excluindo transferências entre contas
  -- Transferências são representadas por:
  --   - transação de saída: expense com to_account_id NÃO nulo
  --   - transação de entrada: income com linked_transaction_id NÃO nulo
  -- Ambas devem ser ignoradas em relatórios de receitas/despesas.
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' THEN t.amount 
      WHEN t.type = 'expense' THEN -ABS(t.amount)
      ELSE 0
    END), 0) AS balance,
    COALESCE(SUM(CASE 
      WHEN t.type = 'expense' THEN ABS(t.amount)
      ELSE 0 
    END), 0) AS total_expenses,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' THEN t.amount 
      ELSE 0 
    END), 0) AS total_income
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.to_account_id IS NULL
    AND t.linked_transaction_id IS NULL
    AND (p_type = 'all' OR t.type::text = p_type)
    AND (p_status = 'all' OR t.status::text = p_status)
    AND (p_account_id = 'all' OR t.account_id::text = p_account_id)
    AND (p_category_id = 'all' OR t.category_id::text = p_category_id)
    AND (p_account_type = 'all' OR t.account_id = ANY(v_account_ids))
    AND (p_date_from IS NULL OR t.date >= p_date_from)
    AND (p_date_to IS NULL OR t.date <= p_date_to)
    AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%');
END;
$$;
