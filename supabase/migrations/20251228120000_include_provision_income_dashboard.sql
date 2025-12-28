-- Atualiza a função get_dashboard_metrics para INCLUIR provisões positivas (receitas)
-- Anteriormente, provisões positivas eram excluídas com: AND NOT (t.is_provision IS TRUE AND t.amount > 0)

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_user_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  period_income NUMERIC,
  period_expenses NUMERIC,
  balance NUMERIC,
  pending_income NUMERIC,
  pending_expenses NUMERIC,
  credit_card_expenses NUMERIC,
  pending_income_count BIGINT,
  pending_expenses_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Security: validar que p_user_id = usuário autenticado
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: auth.uid() is NULL';
  END IF;
  IF v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user_id (%) does not match authenticated user (%)',
      p_user_id::text, v_auth_user_id::text;
  END IF;

  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências
      AND t.type != 'transfer'
      AND t.to_account_id IS NULL
      AND NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL)
      -- EXCLUIR Saldo Inicial
      AND t.description != 'Saldo Inicial'
      -- EXCLUIR apenas o PAI de transações fixas (templates)
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- REMOVIDO: EXCLUIR provisões positivas (overspent)
      -- Agora permitimos que provisões de receita (amount > 0) sejam contabilizadas
      
      -- Filtro de data
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
  )
  SELECT 
    -- Totais Gerais
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::NUMERIC as period_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as period_expenses,
    COALESCE(
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 
      0
    )::NUMERIC as balance,
    
    -- Pendentes
    COALESCE(SUM(CASE WHEN type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0)::NUMERIC as pending_income,
    COALESCE(SUM(CASE WHEN type = 'expense' AND status = 'pending' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as pending_expenses,
    
    -- Cartão de Crédito
    COALESCE(SUM(CASE WHEN type = 'expense' AND account_type = 'credit' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as credit_card_expenses,
    
    -- Contagens
    COUNT(CASE WHEN type = 'income' AND status = 'pending' THEN 1 END) as pending_income_count,
    COUNT(CASE WHEN type = 'expense' AND status = 'pending' THEN 1 END) as pending_expenses_count
  FROM filtered_transactions;
END;
$$;
