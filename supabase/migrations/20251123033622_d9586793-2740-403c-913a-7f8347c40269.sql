-- Update atomic_create_transfer function to accept separate descriptions
DROP FUNCTION IF EXISTS atomic_create_transfer(UUID, UUID, UUID, NUMERIC, TEXT, DATE, transaction_status);

CREATE FUNCTION atomic_create_transfer(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_outgoing_description TEXT,
  p_incoming_description TEXT,
  p_date DATE,
  p_status transaction_status
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  outgoing_transaction_id UUID,
  incoming_transaction_id UUID,
  from_balance NUMERIC,
  to_balance NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_account_type account_type;
  v_to_account_type account_type;
  v_from_limit NUMERIC;
BEGIN
  -- Validate accounts exist and belong to user
  SELECT type, limit_amount INTO v_from_account_type, v_from_limit
  FROM accounts 
  WHERE id = p_from_account_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Source account not found'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  SELECT type INTO v_to_account_type
  FROM accounts 
  WHERE id = p_to_account_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Destination account not found'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Validate same account
  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT false, 'Cannot transfer to the same account'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Check balance (including limit for credit accounts)
  SELECT balance INTO v_from_balance FROM accounts WHERE id = p_from_account_id;
  
  IF v_from_account_type = 'credit' THEN
    IF v_from_balance + COALESCE(v_from_limit, 0) < p_amount THEN
      RETURN QUERY SELECT false, 'Insufficient balance (including limit)'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
  ELSE
    IF v_from_balance < p_amount THEN
      RETURN QUERY SELECT false, 'Insufficient balance'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
  END IF;
  
  -- Create outgoing transaction with outgoing description
  INSERT INTO transactions (
    user_id, account_id, type, amount, date, description, status, to_account_id
  ) VALUES (
    p_user_id, p_from_account_id, 'expense', p_amount, p_date, p_outgoing_description, p_status, p_to_account_id
  ) RETURNING id INTO v_outgoing_id;
  
  -- Create incoming transaction with incoming description
  INSERT INTO transactions (
    user_id, account_id, type, amount, date, description, status, linked_transaction_id
  ) VALUES (
    p_user_id, p_to_account_id, 'income', p_amount, p_date, p_incoming_description, p_status, v_outgoing_id
  ) RETURNING id INTO v_incoming_id;
  
  -- Update linked_transaction_id for outgoing
  UPDATE transactions SET linked_transaction_id = v_incoming_id WHERE id = v_outgoing_id;
  
  -- Update balances
  UPDATE accounts SET balance = balance - p_amount WHERE id = p_from_account_id RETURNING balance INTO v_from_balance;
  UPDATE accounts SET balance = balance + p_amount WHERE id = p_to_account_id RETURNING balance INTO v_to_balance;
  
  -- Return success
  RETURN QUERY SELECT true, ''::TEXT, v_outgoing_id, v_incoming_id, v_from_balance, v_to_balance;
END;
$$;