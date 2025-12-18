-- Fix: Corrigir tipo da transação de entrada em transferências
-- Problema: A transação de entrada estava sendo criada como 'income' em vez de 'transfer'
-- Isso causava inconsistência no filtro e no cálculo de saldos

-- Passo 1: Atualizar transferências existentes que têm type='income' mas são transferências
UPDATE public.transactions
SET type = 'transfer'
WHERE type = 'income'
  AND linked_transaction_id IS NOT NULL;

-- Passo 2: Recriar a função atomic_create_transfer com o tipo correto
CREATE OR REPLACE FUNCTION public.atomic_create_transfer(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_date DATE,
  p_outgoing_description TEXT DEFAULT NULL,
  p_incoming_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'completed'
)
RETURNS TABLE (
  success BOOLEAN,
  outgoing_transaction_id UUID,
  incoming_transaction_id UUID,
  from_balance NUMERIC,
  to_balance NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_account_user_id UUID;
  v_to_account_user_id UUID;
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_status public.transaction_status;
BEGIN
  -- Tentar converter o status
  BEGIN
    v_status := p_status::public.transaction_status;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Invalid status value: ' || p_status;
    RETURN;
  END;

  -- 🔐 SECURITY: VALIDAR USER_ID
  BEGIN
    IF (SELECT to_regproc('public.validate_user_access')) IS NOT NULL THEN
      IF NOT validate_user_access(p_user_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Unauthorized access'::TEXT;
        RETURN;
      END IF;
    ELSE
      IF auth.uid() != p_user_id THEN
         RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Unauthorized access (fallback)'::TEXT;
         RETURN;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
     RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Security validation failed: ' || SQLERRM;
     RETURN;
  END;

  -- Validar que ambas contas pertencem ao usuário
  SELECT user_id INTO v_from_account_user_id FROM accounts WHERE id = p_from_account_id;
  SELECT user_id INTO v_to_account_user_id FROM accounts WHERE id = p_to_account_id;

  IF v_from_account_user_id IS NULL OR v_to_account_user_id IS NULL THEN
     RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Account not found'::TEXT;
     RETURN;
  END IF;

  IF v_from_account_user_id != p_user_id OR v_to_account_user_id != p_user_id THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'One or both accounts do not belong to user'::TEXT;      
    RETURN;
  END IF;

  -- 1. Inserir transação de SAÍDA (Débito) - type='transfer', amount negativo
  INSERT INTO transactions (
    user_id, account_id, category_id, amount, type,
    date, description, status, to_account_id, created_at, updated_at
  ) VALUES (
    p_user_id, p_from_account_id, NULL, -ABS(p_amount), 'transfer',
    p_date, COALESCE(p_outgoing_description, 'Transferência enviada'), v_status, p_to_account_id, NOW(), NOW()
  )
  RETURNING id INTO v_outgoing_id;

  -- 2. Inserir transação de ENTRADA (Crédito) - type='transfer', amount positivo
  -- FIX CRÍTICO: Mudado de 'income' para 'transfer'
  INSERT INTO transactions (
    user_id, account_id, category_id, amount, type,
    date, description, status, linked_transaction_id, created_at, updated_at
  ) VALUES (
    p_user_id, p_to_account_id, NULL, ABS(p_amount), 'transfer',
    p_date, COALESCE(p_incoming_description, 'Transferência recebida'), v_status, v_outgoing_id, NOW(), NOW()
  )
  RETURNING id INTO v_incoming_id;

  -- 3. Atualizar saldos das contas (se status for completed)
  IF v_status = 'completed' THEN
    UPDATE accounts SET balance = balance - ABS(p_amount) WHERE id = p_from_account_id RETURNING balance INTO v_from_balance;
    UPDATE accounts SET balance = balance + ABS(p_amount) WHERE id = p_to_account_id RETURNING balance INTO v_to_balance;
  ELSE
    -- Se não completado, retornar saldos atuais
    SELECT balance INTO v_from_balance FROM accounts WHERE id = p_from_account_id;
    SELECT balance INTO v_to_balance FROM accounts WHERE id = p_to_account_id;
  END IF;

  RETURN QUERY SELECT true, v_outgoing_id, v_incoming_id, v_from_balance, v_to_balance, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'SQL Error: ' || SQLERRM;
END;
$$;
