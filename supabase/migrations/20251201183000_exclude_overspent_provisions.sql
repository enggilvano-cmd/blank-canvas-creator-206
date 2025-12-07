-- Update get_transactions_totals to exclude overspent provisions (positive amount)
-- Because when a provision is overspent, the actual expenses are already counted, 
-- so counting the positive provision would be incorrect/redundant.

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
      -- Excluir apenas o PAI das transações fixas (mantém as filhas)
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- Excluir provisões estouradas (saldo positivo)
      AND NOT (t.is_provision IS TRUE AND t.amount > 0)
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

COMMENT ON FUNCTION public.get_transactions_totals IS 
'Calcula totais agregados (receitas, despesas e saldo) com base em filtros. 
SEMPRE exclui transações de transferência e transações fixas parent.
AGORA TAMBÉM exclui provisões estouradas (amount > 0).
Parâmetros na ordem: user_id, type, status, account_id, category_id, account_type, date_from, date_to, search';
