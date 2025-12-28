-- Atualiza a função get_transactions_totals para INCLUIR provisões positivas (receitas)
-- Anteriormente, provisões positivas eram excluídas com: AND NOT (t.is_provision IS TRUE AND t.amount > 0)

CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id UUID,
  p_type TEXT DEFAULT 'all',
  p_status TEXT DEFAULT 'all',
  p_account_id TEXT DEFAULT 'all',
  p_category_id TEXT DEFAULT 'all',
  p_account_type TEXT DEFAULT 'all',
  p_is_fixed BOOLEAN DEFAULT NULL,
  p_is_provision BOOLEAN DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_invoice_month TEXT DEFAULT 'all',
  p_include_transfers BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  total_income NUMERIC,
  total_expenses NUMERIC,
  balance NUMERIC
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
      t.category_id,
      t.description,
      t.invoice_month,
      t.is_fixed,
      t.is_provision,
      t.linked_transaction_id,
      t.to_account_id,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências SE p_include_transfers for FALSE
      AND (
        p_include_transfers IS TRUE 
        OR (
          t.type != 'transfer'
          AND t.to_account_id IS NULL
          AND NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL)
        )
      )
      -- EXCLUIR apenas o PAI de transações fixas
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- EXCLUIR Saldo Inicial
      AND t.description != 'Saldo Inicial'
      -- REMOVIDO: EXCLUIR provisões positivas (overspent)
      -- Agora permitimos que provisões de receita (amount > 0) sejam contabilizadas
      
      -- Filtros
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      AND (p_is_provision IS NULL OR t.is_provision = p_is_provision)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_invoice_month = 'all' OR t.invoice_month = p_invoice_month)
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
  )
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN type = 'income' THEN amount 
        WHEN type = 'transfer' AND linked_transaction_id IS NOT NULL AND to_account_id IS NULL THEN amount 
        ELSE 0 
      END
    ), 0)::NUMERIC as total_income,
    
    COALESCE(SUM(
      CASE 
        WHEN type = 'expense' THEN ABS(amount) 
        WHEN type = 'transfer' AND (to_account_id IS NOT NULL OR linked_transaction_id IS NULL) THEN ABS(amount)
        ELSE 0 
      END
    ), 0)::NUMERIC as total_expenses,
    
    COALESCE(
      SUM(
        CASE 
          WHEN type = 'income' THEN amount 
          WHEN type = 'transfer' AND linked_transaction_id IS NOT NULL AND to_account_id IS NULL THEN amount 
          ELSE 0 
        END
      ) - 
      SUM(
        CASE 
          WHEN type = 'expense' THEN ABS(amount) 
          WHEN type = 'transfer' AND (to_account_id IS NOT NULL OR linked_transaction_id IS NULL) THEN ABS(amount)
          ELSE 0 
        END
      ), 
      0
    )::NUMERIC as balance
  FROM filtered_transactions;
END;
$$;
