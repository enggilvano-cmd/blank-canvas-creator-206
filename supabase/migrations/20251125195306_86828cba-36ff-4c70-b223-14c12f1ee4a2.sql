-- Fix atomic_delete_transaction to delete parent + all children when called from a child fixed/recurring transaction with scope = 'all'
CREATE OR REPLACE FUNCTION public.atomic_delete_transaction(p_user_id uuid, p_transaction_id uuid, p_scope text DEFAULT 'current'::text)
RETURNS TABLE(deleted_count integer, affected_accounts uuid[], success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_date DATE;
  v_transaction_type transaction_type;
  v_linked_id UUID;
  v_parent_id UUID;
  v_installments INTEGER;
  v_current_installment INTEGER;
  v_is_fixed BOOLEAN;
  v_is_recurring BOOLEAN;
  v_parent_is_fixed BOOLEAN;
  v_parent_is_recurring BOOLEAN;
  v_transaction_ids UUID[];
  v_affected_accounts UUID[];
  v_deleted_count INTEGER := 0;
  v_locked_transactions TEXT[];
BEGIN
  -- Buscar transação
  SELECT date, type, linked_transaction_id, parent_transaction_id,
         installments, current_installment, is_fixed, is_recurring
  INTO v_transaction_date, v_transaction_type, v_linked_id, v_parent_id,
       v_installments, v_current_installment, v_is_fixed, v_is_recurring
  FROM transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, NULL::UUID[], false, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- Se for filha de fixa/recorrente, herdar flags do parent
  IF v_parent_id IS NOT NULL THEN
    SELECT is_fixed, is_recurring
    INTO v_parent_is_fixed, v_parent_is_recurring
    FROM transactions
    WHERE id = v_parent_id AND user_id = p_user_id;

    IF v_parent_is_fixed IS TRUE THEN
      v_is_fixed := true;
    END IF;

    IF v_parent_is_recurring IS TRUE THEN
      v_is_recurring := true;
    END IF;
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
  ELSIF (v_is_fixed = true OR v_is_recurring = true) AND v_parent_id IS NOT NULL THEN
    -- Transação fixa/recorrente com parent
    IF p_scope = 'current' THEN
      v_transaction_ids := ARRAY[p_transaction_id];
    ELSIF p_scope = 'current-and-remaining' THEN
      -- Para transações fixas, deletar esta e as próximas baseado na data
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
        AND date >= v_transaction_date
        AND user_id = p_user_id;
    ELSE -- 'all'
      -- FIX: quando chamado de uma filha com escopo 'all', deletar o parent + todas as filhas
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE (id = v_parent_id OR parent_transaction_id = v_parent_id)
        AND user_id = p_user_id;
    END IF;
  ELSIF (v_is_fixed = true OR v_is_recurring = true) THEN
    -- Transação fixa/recorrente que é a parent (primeira da série)
    IF p_scope = 'current' THEN
      v_transaction_ids := ARRAY[p_transaction_id];
    ELSIF p_scope = 'current-and-remaining' THEN
      -- Deletar esta e as próximas (filhas)
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
        AND date >= v_transaction_date
        AND user_id = p_user_id;
    ELSE -- 'all'
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
        AND user_id = p_user_id;
    END IF;
  ELSE
    -- Transação simples
    v_transaction_ids := ARRAY[p_transaction_id];
  END IF;

  -- Verificar se alguma transação está em período bloqueado
  SELECT ARRAY_AGG(description || ' (' || date || ')')
  INTO v_locked_transactions
  FROM transactions
  WHERE id = ANY(v_transaction_ids)
    AND is_period_locked(p_user_id, date);

  IF v_locked_transactions IS NOT NULL AND array_length(v_locked_transactions, 1) > 0 THEN
    RETURN QUERY SELECT
      0,
      NULL::UUID[],
      false,
      ('Cannot delete transactions in locked periods: ' || array_to_string(v_locked_transactions, ', '))::TEXT;
    RETURN;
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

    -- 2. Deletar transações
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
$function$;