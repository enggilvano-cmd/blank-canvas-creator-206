-- ✅ BUG FIX #4: Adicionar validação de user_id em get_transactions_totals
-- Garante que usuários só podem acessar seus próprios totais agregados
-- Esta função é chamada frequentemente, então a validação é crítica

CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id UUID,
  p_account_id TEXT DEFAULT NULL,
  p_account_type TEXT DEFAULT NULL,
  p_category_id TEXT DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_is_fixed BOOLEAN DEFAULT NULL,
  p_is_recurring BOOLEAN DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_date_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_income NUMERIC,
  total_expense NUMERIC,
  total_transfer NUMERIC,
  total_balance NUMERIC,
  income_by_category JSONB,
  expense_by_category JSONB,
  by_account JSONB,
  total_transactions INTEGER,
  currency_code TEXT,
  generated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_total_income NUMERIC := 0;
  v_total_expense NUMERIC := 0;
  v_total_transfer NUMERIC := 0;
  v_total_balance NUMERIC := 0;
  v_total_count INTEGER := 0;
  v_currency TEXT := 'BRL';
BEGIN
  -- 🔐 SECURITY: VALIDAR USER_ID PRIMEIRO (BUG FIX #4)
  IF NOT validate_user_access(p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized access: user_id does not match authenticated user'
      USING ERRCODE = 'PGRST403';
  END IF;

  -- Determinar período
  CASE p_date_filter
    WHEN 'current_month' THEN
      v_start_date := DATE_TRUNC('month', NOW())::DATE;
      v_end_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month')::DATE - INTERVAL '1 day'::INTERVAL;
    WHEN 'current_year' THEN
      v_start_date := DATE_TRUNC('year', NOW())::DATE;
      v_end_date := DATE_TRUNC('year', NOW() + INTERVAL '1 year')::DATE - INTERVAL '1 day'::INTERVAL;
    WHEN 'last_30' THEN
      v_start_date := CURRENT_DATE - INTERVAL '30 days'::INTERVAL;
      v_end_date := CURRENT_DATE;
    ELSE
      v_start_date := COALESCE(p_start_date, '2000-01-01'::DATE);
      v_end_date := COALESCE(p_end_date, CURRENT_DATE);
  END CASE;

  -- Agregação com filtros
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'transfer' THEN ABS(amount) ELSE 0 END), 0),
    COUNT(*)
  INTO v_total_income, v_total_expense, v_total_transfer, v_total_count
  FROM transactions
  WHERE user_id = p_user_id
    AND date >= v_start_date
    AND date <= v_end_date
    AND (p_account_id IS NULL OR account_id::TEXT = p_account_id)
    AND (p_category_id IS NULL OR category_id::TEXT = p_category_id)
    AND (p_transaction_type IS NULL OR type = p_transaction_type)
    AND (p_is_fixed IS NULL OR is_fixed = p_is_fixed)
    AND (p_status IS NULL OR status = p_status);

  v_total_balance := v_total_income - v_total_expense;

  -- Retornar dados agregados
  RETURN QUERY SELECT
    v_total_income,
    v_total_expense,
    v_total_transfer,
    v_total_balance,
    (SELECT JSONB_OBJECT_AGG(category_name, category_total)
     FROM (
       SELECT c.name as category_name, COALESCE(SUM(t.amount), 0) as category_total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = p_user_id
         AND t.type = 'income'
         AND t.date >= v_start_date
         AND t.date <= v_end_date
       GROUP BY c.name
     ) income_cats)::JSONB,
    (SELECT JSONB_OBJECT_AGG(category_name, category_total)
     FROM (
       SELECT c.name as category_name, COALESCE(SUM(t.amount), 0) as category_total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = p_user_id
         AND t.type = 'expense'
         AND t.date >= v_start_date
         AND t.date <= v_end_date
       GROUP BY c.name
     ) expense_cats)::JSONB,
    (SELECT JSONB_OBJECT_AGG(account_name, account_balance)
     FROM (
       SELECT a.name as account_name, COALESCE(SUM(t.amount), 0) as account_balance
       FROM transactions t
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = p_user_id
         AND t.date >= v_start_date
         AND t.date <= v_end_date
       GROUP BY a.name
     ) account_totals)::JSONB,
    v_total_count,
    v_currency,
    NOW();

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'get_transactions_totals error for user %: %', p_user_id, SQLERRM;
  RAISE EXCEPTION 'Error calculating totals: %', SQLERRM;
END;
$$;

