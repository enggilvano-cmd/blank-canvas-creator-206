-- Remove todas as versões antigas de get_transactions_totals e cria apenas uma versão correta
-- com suporte aos filtros is_fixed e is_provision

-- Droppar todas as sobrecargas da função
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_transactions_totals(UUID);

-- Criar ÚNICA versão correta com todos os filtros
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
      -- Excluir APENAS receitas espelho de transferências (income com linked_transaction_id)
      -- Mas PERMITIR despesas vinculadas (expense com to_account_id)
      AND NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL)
      -- Excluir apenas o PAI das transações fixas
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- NOVA REGRA: Excluir provisões estouradas (saldo positivo)
      AND NOT (t.is_provision IS TRUE AND t.amount > 0)
      -- Filtros de is_fixed e is_provision
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      AND (p_is_provision IS NULL OR t.is_provision = p_is_provision)
      -- Filtros normais
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
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

COMMENT ON FUNCTION public.get_transactions_totals IS 
'Calculate total income, expenses, and balance for transactions with comprehensive filtering.
Parameters:
- p_user_id: User ID (required)
- p_type: Filter by transaction type (all, income, expense, transfer)
- p_status: Filter by status (all, pending, completed)
- p_account_id: Filter by account ID (all for no filter)
- p_category_id: Filter by category ID (all for no filter)
- p_account_type: Filter by account type (all, checking, savings, credit, investment, meal_voucher)
- p_is_fixed: Filter by fixed transactions (NULL for no filter, TRUE/FALSE for specific value)
- p_is_provision: Filter by provisions (NULL for no filter, TRUE/FALSE for specific value)
- p_date_from: Filter from date (NULL for no filter)
- p_date_to: Filter to date (NULL for no filter)
- p_search: Search in description (NULL or empty for no filter)';
