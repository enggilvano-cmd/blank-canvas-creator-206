-- Fix get_transactions_totals function - remove is_provision references
CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id uuid,
  p_type text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_account_type text DEFAULT 'all',
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_invoice_month text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_is_fixed boolean DEFAULT NULL,
  p_is_provision boolean DEFAULT NULL
)
RETURNS TABLE(total_income numeric, total_expenses numeric, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN t.type = 'income' AND t.type != 'transfer' THEN t.amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.type != 'transfer' THEN t.amount ELSE 0 END), 0) as total_expenses,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' AND t.type != 'transfer' THEN t.amount 
      WHEN t.type = 'expense' AND t.type != 'transfer' THEN -t.amount 
      ELSE 0 
    END), 0) as balance
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  WHERE t.user_id = p_user_id
    AND (p_type = 'all' OR t.type::text = p_type)
    AND (p_status = 'all' OR t.status::text = p_status)
    AND (p_account_type = 'all' OR a.type::text = p_account_type)
    AND (p_date_from IS NULL OR t.date >= p_date_from::date)
    AND (p_date_to IS NULL OR t.date <= p_date_to::date)
    AND (p_account_id IS NULL OR t.account_id = p_account_id)
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_invoice_month IS NULL OR t.invoice_month = p_invoice_month)
    AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%')
    AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed);
END;
$$;

-- Fix cleanup_expired_provisions function - make it a no-op since is_provision doesn't exist
CREATE OR REPLACE FUNCTION public.cleanup_expired_provisions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: is_provision column doesn't exist in current schema
  -- This function is kept for backwards compatibility
  NULL;
END;
$$;