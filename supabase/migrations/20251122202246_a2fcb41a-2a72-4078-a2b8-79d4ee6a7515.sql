-- Corrigir atomic_update_transaction para aplicar sinal correto ao amount baseado no tipo da transação

CREATE OR REPLACE FUNCTION public.atomic_update_transaction(
  p_user_id UUID,
  p_transaction_id UUID,
  p_updates JSONB,
  p_scope TEXT DEFAULT 'current'
)
RETURNS TABLE(
  updated_count INTEGER,
  affected_accounts UUID[],
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_date DATE;
  v_parent_id UUID;
  v_current_installment INTEGER;
  v_transaction_ids UUID[];
  v_affected_accounts UUID[];
  v_updated_count INTEGER := 0;
  v_old_account_id UUID;
  v_new_account_id UUID;
  v_amount NUMERIC;
  v_type transaction_type;
  v_current_type transaction_type;
BEGIN
  -- Buscar transação
  SELECT date, parent_transaction_id, current_installment, account_id, type
  INTO v_transaction_date, v_parent_id, v_current_installment, v_old_account_id, v_current_type
  FROM transactions 
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, NULL::UUID[], false, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- Validar período não está fechado
  IF is_period_locked(p_user_id, v_transaction_date) THEN
    RETURN QUERY SELECT 0, NULL::UUID[], false, 'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Determinar transações a atualizar baseado no scope
  IF p_scope = 'current' THEN
    v_transaction_ids := ARRAY[p_transaction_id];
  ELSIF p_scope = 'current-and-remaining' THEN
    SELECT ARRAY_AGG(id) INTO v_transaction_ids
    FROM transactions
    WHERE parent_transaction_id = COALESCE(v_parent_id, p_transaction_id)
      AND current_installment >= v_current_installment
      AND user_id = p_user_id;
  ELSE -- 'all'
    SELECT ARRAY_AGG(id) INTO v_transaction_ids
    FROM transactions
    WHERE parent_transaction_id = COALESCE(v_parent_id, p_transaction_id)
      AND user_id = p_user_id;
  END IF;

  -- INÍCIO DA TRANSAÇÃO EXPLÍCITA
  BEGIN
    -- Coletar conta antiga
    v_affected_accounts := ARRAY[v_old_account_id];

    -- Determinar o tipo da transação (pode estar sendo atualizado)
    v_type := COALESCE((p_updates->>'type')::transaction_type, v_current_type);

    -- Ajustar o sinal do amount baseado no tipo
    IF p_updates ? 'amount' THEN
      v_amount := (p_updates->>'amount')::NUMERIC;
      -- Garantir que o amount tenha o sinal correto
      IF v_type = 'expense' THEN
        v_amount := -ABS(v_amount);  -- Expense sempre negativo
      ELSIF v_type = 'income' THEN
        v_amount := ABS(v_amount);   -- Income sempre positivo
      END IF;
    END IF;

    -- Atualizar transações dinamicamente baseado no JSONB
    UPDATE transactions SET
      description = COALESCE((p_updates->>'description')::TEXT, description),
      amount = COALESCE(v_amount, amount),
      date = COALESCE((p_updates->>'date')::DATE, date),
      type = COALESCE((p_updates->>'type')::transaction_type, type),
      category_id = COALESCE((p_updates->>'category_id')::UUID, category_id),
      account_id = COALESCE((p_updates->>'account_id')::UUID, account_id),
      status = COALESCE((p_updates->>'status')::transaction_status, status),
      invoice_month = COALESCE((p_updates->>'invoice_month')::TEXT, invoice_month),
      updated_at = now()
    WHERE id = ANY(v_transaction_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Se mudou conta, adicionar nova conta afetada
    v_new_account_id := (p_updates->>'account_id')::UUID;
    IF v_new_account_id IS NOT NULL AND v_new_account_id != v_old_account_id THEN
      v_affected_accounts := v_affected_accounts || v_new_account_id;
    END IF;

    -- Recalcular saldos das contas afetadas
    FOR i IN 1..COALESCE(array_length(v_affected_accounts, 1), 0) LOOP
      PERFORM recalculate_account_balance(v_affected_accounts[i]);
    END LOOP;

    -- Retornar sucesso
    RETURN QUERY SELECT v_updated_count, v_affected_accounts, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT 0, NULL::UUID[], false, SQLERRM::TEXT;
  END;
END;
$$;

COMMENT ON FUNCTION public.atomic_update_transaction IS 'Atualiza transação(ões) garantindo sinal correto do amount e recalcula saldos atomicamente';