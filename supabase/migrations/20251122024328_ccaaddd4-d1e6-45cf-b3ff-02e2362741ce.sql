-- =========================================================================
-- FIX: atomic_delete_transaction - Remove invalid RETURNING clause
-- =========================================================================
-- PROBLEM: Line "RETURNING * INTO v_deleted_count" tries to assign all 
-- columns (including UUID id) to an INTEGER variable, causing error:
-- "invalid input syntax for type integer: <uuid>"
--
-- SOLUTION: Remove the RETURNING clause since we use GET DIAGNOSTICS anyway
-- =========================================================================

CREATE OR REPLACE FUNCTION public.atomic_delete_transaction(
  p_user_id UUID,
  p_transaction_id UUID,
  p_scope TEXT DEFAULT 'current'
)
RETURNS TABLE(
  deleted_count INTEGER,
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
  v_transaction_type transaction_type;
  v_linked_id UUID;
  v_parent_id UUID;
  v_installments INTEGER;
  v_current_installment INTEGER;
  v_transaction_ids UUID[];
  v_affected_accounts UUID[];
  v_deleted_count INTEGER := 0;
BEGIN
  -- Buscar transação
  SELECT date, type, linked_transaction_id, parent_transaction_id, installments, current_installment
  INTO v_transaction_date, v_transaction_type, v_linked_id, v_parent_id, v_installments, v_current_installment
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

  -- Determinar transações a deletar baseado no scope
  IF v_transaction_type = 'transfer' OR v_linked_id IS NOT NULL THEN
    -- Transferência: deletar ambas
    v_transaction_ids := ARRAY[p_transaction_id];
    IF v_linked_id IS NOT NULL THEN
      v_transaction_ids := v_transaction_ids || v_linked_id;
    END IF;
  ELSIF v_installments IS NOT NULL AND v_installments > 1 THEN
    -- Parcelamento
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
  ELSE
    -- Transação simples
    v_transaction_ids := ARRAY[p_transaction_id];
  END IF;

  -- INÍCIO DA TRANSAÇÃO EXPLÍCITA
  BEGIN
    -- Coletar contas afetadas
    SELECT ARRAY_AGG(DISTINCT account_id) INTO v_affected_accounts
    FROM transactions
    WHERE id = ANY(v_transaction_ids);

    -- 1. Deletar journal entries
    DELETE FROM journal_entries
    WHERE transaction_id = ANY(v_transaction_ids);

    -- 2. Deletar transações (FIX: removido RETURNING * INTO v_deleted_count)
    DELETE FROM transactions
    WHERE id = ANY(v_transaction_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 3. Recalcular saldos das contas afetadas
    FOR i IN 1..COALESCE(array_length(v_affected_accounts, 1), 0) LOOP
      PERFORM recalculate_account_balance(v_affected_accounts[i]);
    END LOOP;

    -- Retornar sucesso
    RETURN QUERY SELECT v_deleted_count, v_affected_accounts, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT 0, NULL::UUID[], false, SQLERRM::TEXT;
  END;
END;
$$;

COMMENT ON FUNCTION public.atomic_delete_transaction IS 'Deleta transação(ões) com journal entries e recalcula saldos atomicamente - FIXED: removed invalid RETURNING clause';