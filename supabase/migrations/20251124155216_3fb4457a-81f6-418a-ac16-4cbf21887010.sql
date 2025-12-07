-- Função para calcular saldo inicial de forma otimizada usando agregação SQL
CREATE OR REPLACE FUNCTION calculate_opening_balance(
  p_account_id UUID,
  p_start_date DATE,
  p_nature account_nature
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_debit_sum NUMERIC;
  v_credit_sum NUMERIC;
  v_balance NUMERIC;
BEGIN
  -- Calcular soma de débitos e créditos antes da data inicial
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_debit_sum, v_credit_sum
  FROM journal_entries
  WHERE account_id = p_account_id
    AND entry_date < p_start_date;
  
  -- Calcular saldo baseado na natureza da conta
  IF p_nature = 'debit' THEN
    v_balance := v_debit_sum - v_credit_sum;
  ELSE
    v_balance := v_credit_sum - v_debit_sum;
  END IF;
  
  RETURN v_balance;
END;
$$;

COMMENT ON FUNCTION calculate_opening_balance IS 'Calcula saldo inicial de uma conta contábil antes de uma data específica usando agregação SQL otimizada';