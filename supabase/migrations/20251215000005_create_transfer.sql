-- ✅ BUG FIX #4: Adicionar validação de user_id em atomic_create_transfer
-- BUG FIX #4: Impede que usuários façam transferências de contas de outros

CREATE OR REPLACE FUNCTION public.atomic_create_transfer(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_date DATE,
  p_description TEXT DEFAULT ''
)
RETURNS TABLE (
  success BOOLEAN,
  transfer_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_account_user_id UUID;
  v_to_account_user_id UUID;
  v_transfer_id UUID;
BEGIN
  -- 🔐 SECURITY: VALIDAR USER_ID PRIMEIRO (BUG FIX #4)
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- Validar que ambas contas pertencem ao usuário
  SELECT user_id INTO v_from_account_user_id FROM accounts WHERE id = p_from_account_id;
  SELECT user_id INTO v_to_account_user_id FROM accounts WHERE id = p_to_account_id;

  IF v_from_account_user_id != p_user_id OR v_to_account_user_id != p_user_id THEN
    RETURN QUERY SELECT false, NULL::UUID, 'One or both accounts do not belong to user'::TEXT;
    RETURN;
  END IF;

  -- Criar transferência (débito da conta origem, crédito da conta destino)
  v_transfer_id := gen_random_uuid();
  
  -- Inserir transação de débito
  INSERT INTO transactions (
    id, user_id, account_id, category_id, amount, type, 
    date, description, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_from_account_id, NULL, -p_amount, 'transfer',
    p_date, 'Transfer out: ' || COALESCE(p_description, ''), NOW(), NOW()
  );

  -- Inserir transação de crédito
  INSERT INTO transactions (
    id, user_id, account_id, category_id, amount, type, 
    date, description, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_to_account_id, NULL, p_amount, 'transfer',
    p_date, 'Transfer in: ' || COALESCE(p_description, ''), NOW(), NOW()
  );

  RETURN QUERY SELECT true, v_transfer_id, 'Transfer created successfully'::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'atomic_create_transfer failed: %', SQLERRM USING ERRCODE = 'PGRST500';
END;
$$;
