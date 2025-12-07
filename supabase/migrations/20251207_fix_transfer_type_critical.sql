-- ✅ CORREÇÃO CRÍTICA: Transferências estavam sendo criadas com tipo 'expense' em vez de 'transfer'
-- Esta correção garante que as transferências sejam identificadas corretamente no sistema

DROP FUNCTION IF EXISTS public.atomic_create_transfer(uuid, uuid, uuid, numeric, text, text, date, transaction_status);

CREATE OR REPLACE FUNCTION public.atomic_create_transfer(
  p_user_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_outgoing_description text,
  p_incoming_description text,
  p_date date,
  p_status transaction_status
)
RETURNS TABLE(
  success boolean,
  error_message text,
  outgoing_transaction_id uuid,
  incoming_transaction_id uuid,
  from_balance numeric,
  to_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_account_type account_type;
  v_to_account_type account_type;
  v_from_limit NUMERIC;
  v_available_balance NUMERIC;
  v_from_chart_account_id UUID;
  v_to_chart_account_id UUID;
BEGIN
  -- ✅ Set SERIALIZABLE isolation to prevent lost updates
  SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  -- ✅ Lock accounts with SELECT FOR UPDATE to prevent concurrent modifications
  SELECT type, balance, limit_amount INTO v_from_account_type, v_from_balance, v_from_limit
  FROM accounts 
  WHERE id = p_from_account_id AND user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Source account not found'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  SELECT type, balance INTO v_to_account_type, v_to_balance
  FROM accounts 
  WHERE id = p_to_account_id AND user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Destination account not found'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Validar mesma conta
  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT false, 'Cannot transfer to the same account'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Validar saldo disponível (balance + limit) para TODOS os tipos de conta
  v_available_balance := v_from_balance + COALESCE(v_from_limit, 0);
  
  IF v_available_balance < p_amount THEN
    RETURN QUERY SELECT false, 'Insufficient balance'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- ✅ CORREÇÃO CRÍTICA: Criar transação de saída com tipo 'transfer' (não 'expense')
  INSERT INTO transactions (
    user_id, account_id, type, amount, date, description, status, to_account_id
  ) VALUES (
    p_user_id, p_from_account_id, 'transfer', -ABS(p_amount), p_date, p_outgoing_description, p_status, p_to_account_id
  ) RETURNING id INTO v_outgoing_id;
  
  -- Criar transação de entrada
  INSERT INTO transactions (
    user_id, account_id, type, amount, date, description, status, linked_transaction_id
  ) VALUES (
    p_user_id, p_to_account_id, 'income', ABS(p_amount), p_date, p_incoming_description, p_status, v_outgoing_id
  ) RETURNING id INTO v_incoming_id;
  
  -- Atualizar linked_transaction_id da saída
  UPDATE transactions SET linked_transaction_id = v_incoming_id WHERE id = v_outgoing_id;
  
  -- Criar journal entries para transferência se status = completed
  IF p_status = 'completed' THEN
    -- Mapear conta origem para conta contábil
    IF v_from_account_type = 'checking' THEN
      SELECT id INTO v_from_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.02' AND is_active = true LIMIT 1;
    ELSIF v_from_account_type = 'savings' THEN
      SELECT id INTO v_from_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.03' AND is_active = true LIMIT 1;
    ELSIF v_from_account_type = 'investment' THEN
      SELECT id INTO v_from_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.04' AND is_active = true LIMIT 1;
    ELSIF v_from_account_type = 'credit' THEN
      SELECT id INTO v_from_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '2.01.01' AND is_active = true LIMIT 1;
    ELSE
      SELECT id INTO v_from_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.01' AND is_active = true LIMIT 1;
    END IF;
    
    -- Mapear conta destino para conta contábil
    IF v_to_account_type = 'checking' THEN
      SELECT id INTO v_to_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.02' AND is_active = true LIMIT 1;
    ELSIF v_to_account_type = 'savings' THEN
      SELECT id INTO v_to_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.03' AND is_active = true LIMIT 1;
    ELSIF v_to_account_type = 'investment' THEN
      SELECT id INTO v_to_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.04' AND is_active = true LIMIT 1;
    ELSIF v_to_account_type = 'credit' THEN
      SELECT id INTO v_to_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '2.01.01' AND is_active = true LIMIT 1;
    ELSE
      SELECT id INTO v_to_chart_account_id FROM chart_of_accounts 
      WHERE user_id = p_user_id AND code = '1.01.01' AND is_active = true LIMIT 1;
    END IF;
    
    -- Criar lançamentos contábeis (débito e crédito)
    IF v_from_chart_account_id IS NOT NULL AND v_to_chart_account_id IS NOT NULL THEN
      -- Crédito na conta origem (saída de dinheiro)
      INSERT INTO journal_entries (
        user_id, transaction_id, chart_account_id, entry_type, amount, entry_date, description
      ) VALUES (
        p_user_id, v_outgoing_id, v_from_chart_account_id, 'credit', ABS(p_amount), p_date, p_outgoing_description
      );
      
      -- Débito na conta destino (entrada de dinheiro)
      INSERT INTO journal_entries (
        user_id, transaction_id, chart_account_id, entry_type, amount, entry_date, description
      ) VALUES (
        p_user_id, v_incoming_id, v_to_chart_account_id, 'debit', ABS(p_amount), p_date, p_incoming_description
      );
    END IF;
  END IF;
  
  -- Atualizar saldos das contas
  UPDATE accounts SET balance = balance - ABS(p_amount) WHERE id = p_from_account_id;
  UPDATE accounts SET balance = balance + ABS(p_amount) WHERE id = p_to_account_id;
  
  -- Retornar saldos atualizados
  SELECT balance INTO v_from_balance FROM accounts WHERE id = p_from_account_id;
  SELECT balance INTO v_to_balance FROM accounts WHERE id = p_to_account_id;
  
  RETURN QUERY SELECT true, NULL::TEXT, v_outgoing_id, v_incoming_id, v_from_balance, v_to_balance;
  
EXCEPTION
  WHEN serialization_failure THEN
    -- ✅ Handle serialization conflicts gracefully
    RETURN QUERY SELECT false, 'Transaction conflict detected. Please retry.'::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, NULL::UUID, NULL::UUID, 0::NUMERIC, 0::NUMERIC;
END;
$function$;

COMMENT ON FUNCTION public.atomic_create_transfer IS 'Creates atomic transfer between accounts with SERIALIZABLE isolation level and correct transfer type';
