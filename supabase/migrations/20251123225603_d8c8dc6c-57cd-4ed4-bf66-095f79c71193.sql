-- Optimized pagination function using window functions
-- Replaces separate COUNT(*) queries with a single efficient query

CREATE OR REPLACE FUNCTION get_transactions_paginated(
  p_user_id UUID,
  p_page INTEGER DEFAULT 0,
  p_page_size INTEGER DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'all',
  p_account_id TEXT DEFAULT 'all',
  p_category_id TEXT DEFAULT 'all',
  p_status TEXT DEFAULT 'all',
  p_account_type TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'date',
  p_sort_order TEXT DEFAULT 'desc'
)
RETURNS TABLE(
  id UUID,
  description TEXT,
  amount NUMERIC,
  date DATE,
  type transaction_type,
  category_id UUID,
  account_id UUID,
  status transaction_status,
  to_account_id UUID,
  installments INTEGER,
  current_installment INTEGER,
  parent_transaction_id UUID,
  linked_transaction_id UUID,
  invoice_month TEXT,
  invoice_month_overridden BOOLEAN,
  is_recurring BOOLEAN,
  recurrence_type recurrence_type,
  recurrence_end_date DATE,
  is_fixed BOOLEAN,
  reconciled BOOLEAN,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.*,
      COUNT(*) OVER() AS total_count
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%')
      AND (p_type = 'all' OR t.type::TEXT = p_type)
      AND (p_account_id = 'all' OR t.account_id::TEXT = p_account_id)
      AND (p_category_id = 'all' OR t.category_id::TEXT = p_category_id)
      AND (p_status = 'all' OR t.status::TEXT = p_status)
      AND (p_account_type = 'all' OR a.type::TEXT = p_account_type)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
    ORDER BY 
      CASE 
        WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN t.date
      END ASC,
      CASE 
        WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN t.date
      END DESC,
      CASE 
        WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN t.amount
      END ASC,
      CASE 
        WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN t.amount
      END DESC
    LIMIT p_page_size
    OFFSET p_page * p_page_size
  )
  SELECT 
    ft.id,
    ft.description,
    ft.amount,
    ft.date,
    ft.type,
    ft.category_id,
    ft.account_id,
    ft.status,
    ft.to_account_id,
    ft.installments,
    ft.current_installment,
    ft.parent_transaction_id,
    ft.linked_transaction_id,
    ft.invoice_month,
    ft.invoice_month_overridden,
    ft.is_recurring,
    ft.recurrence_type,
    ft.recurrence_end_date,
    ft.is_fixed,
    ft.reconciled,
    ft.reconciled_at,
    ft.reconciled_by,
    ft.created_at,
    ft.updated_at,
    ft.total_count
  FROM filtered_transactions ft;
END;
$$;

COMMENT ON FUNCTION get_transactions_paginated IS 'Optimized pagination with window functions - returns data and total count in single query';
