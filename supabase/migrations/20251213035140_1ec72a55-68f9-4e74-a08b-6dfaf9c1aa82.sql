-- Drop the old function signature first
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean, date, date, text, text);

-- Recreate the function with correct signature and without is_provision references
CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id uuid,
  p_type text DEFAULT 'all'::text,
  p_status text DEFAULT 'all'::text,
  p_account_id text DEFAULT 'all'::text,
  p_category_id text DEFAULT 'all'::text,
  p_account_type text DEFAULT 'all'::text,
  p_is_fixed boolean DEFAULT NULL::boolean,
  p_is_provision boolean DEFAULT NULL::boolean,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_search text DEFAULT NULL::text,
  p_invoice_month text DEFAULT 'all'::text
)
RETURNS TABLE(total_income numeric, total_expenses numeric, balance numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      t.invoice_month,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências tipo 'transfer' dos cálculos de receitas/despesas
      AND t.type != 'transfer'
      -- Excluir receitas espelho APENAS quando estiver calculando totais gerais (p_type = 'all')
      AND (p_type != 'all' OR NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL))
      -- Excluir apenas o PAI das transações fixas
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- Filtros de is_fixed (is_provision não existe mais)
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      -- Filtros normais
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
      AND (p_invoice_month = 'all' OR t.invoice_month = p_invoice_month)
      -- Sempre excluir Saldo Inicial
      AND t.description != 'Saldo Inicial'
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
$$;

-- Also drop the other signature I created earlier that conflicts
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean);