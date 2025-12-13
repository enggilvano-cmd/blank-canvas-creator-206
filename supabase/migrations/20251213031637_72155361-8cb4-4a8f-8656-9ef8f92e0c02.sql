-- Create atomic_create_transaction function
CREATE OR REPLACE FUNCTION public.atomic_create_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type public.transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status public.transaction_status,
  p_invoice_month TEXT DEFAULT NULL,
  p_invoice_month_overridden BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(success BOOLEAN, transaction_id UUID, new_balance NUMERIC, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_transaction_id UUID;
  v_account_type TEXT;
  v_new_balance NUMERIC;
  v_balance_change NUMERIC;
BEGIN
  -- Validar período não está fechado
  IF is_period_locked(p_user_id, p_date) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Buscar tipo da conta
  SELECT type INTO v_account_type
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- Calcular mudança de saldo baseado no tipo
  IF p_type = 'income' THEN
    v_balance_change := ABS(p_amount);
  ELSE
    v_balance_change := -ABS(p_amount);
  END IF;

  -- Inserir transação
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, 
    account_id, status, invoice_month, invoice_month_overridden
  )
  VALUES (
    p_user_id, p_description, v_balance_change, p_date, p_type, p_category_id,
    p_account_id, p_status, p_invoice_month, p_invoice_month_overridden
  )
  RETURNING id INTO v_transaction_id;

  -- Atualizar saldo se transação está completed e não é cartão de crédito
  IF p_status = 'completed' AND v_account_type != 'credit' THEN
    UPDATE accounts
    SET balance = balance + v_balance_change
    WHERE id = p_account_id AND user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSE
    SELECT balance INTO v_new_balance
    FROM accounts
    WHERE id = p_account_id;
  END IF;

  RETURN QUERY SELECT true, v_transaction_id, v_new_balance, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, SQLERRM::TEXT;
END;
$$;