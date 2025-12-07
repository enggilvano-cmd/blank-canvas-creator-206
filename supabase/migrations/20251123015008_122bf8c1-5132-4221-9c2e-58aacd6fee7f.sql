-- Atualizar função atomic_delete_transaction para suportar transações fixas/recorrentes
CREATE OR REPLACE FUNCTION public.atomic_delete_transaction(
  p_user_id uuid, 
  p_transaction_id uuid, 
  p_scope text DEFAULT 'current'::text
)
RETURNS TABLE(
  deleted_count integer, 
  affected_accounts uuid[], 
  success boolean, 
  error_message text
)
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
  v_transaction_ids UUID[];
  v_affected_accounts UUID[];
  v_deleted_count INTEGER := 0;
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
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
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

-- Atualizar função atomic_update_transaction para suportar transações fixas/recorrentes
CREATE OR REPLACE FUNCTION public.atomic_update_transaction(
  p_user_id uuid, 
  p_transaction_id uuid, 
  p_updates jsonb, 
  p_scope text DEFAULT 'current'::text
)
RETURNS TABLE(
  updated_count integer, 
  affected_accounts uuid[], 
  success boolean, 
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_date DATE;
  v_parent_id UUID;
  v_current_installment INTEGER;
  v_is_fixed BOOLEAN;
  v_is_recurring BOOLEAN;
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
  SELECT date, parent_transaction_id, current_installment, account_id, type, is_fixed, is_recurring
  INTO v_transaction_date, v_parent_id, v_current_installment, v_old_account_id, v_current_type, v_is_fixed, v_is_recurring
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
    -- Verificar se é parcelamento
    IF v_current_installment IS NOT NULL AND v_parent_id IS NOT NULL THEN
      -- Parcelamento: usar current_installment
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
        AND current_installment >= v_current_installment
        AND user_id = p_user_id;
    ELSIF (v_is_fixed = true OR v_is_recurring = true) THEN
      -- Transação fixa/recorrente: usar data
      IF v_parent_id IS NOT NULL THEN
        -- Tem parent, buscar irmãs
        SELECT ARRAY_AGG(id) INTO v_transaction_ids
        FROM transactions
        WHERE parent_transaction_id = v_parent_id
          AND date >= v_transaction_date
          AND user_id = p_user_id;
      ELSE
        -- É a parent, buscar filhas
        SELECT ARRAY_AGG(id) INTO v_transaction_ids
        FROM transactions
        WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
          AND date >= v_transaction_date
          AND user_id = p_user_id;
      END IF;
    ELSE
      v_transaction_ids := ARRAY[p_transaction_id];
    END IF;
  ELSE -- 'all'
    IF v_parent_id IS NOT NULL THEN
      -- Tem parent, buscar todas as irmãs
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
        AND user_id = p_user_id;
    ELSIF (v_is_fixed = true OR v_is_recurring = true OR v_current_installment IS NOT NULL) THEN
      -- É a parent, buscar todas (ela + filhas)
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
        AND user_id = p_user_id;
    ELSE
      v_transaction_ids := ARRAY[p_transaction_id];
    END IF;
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
      invoice_month_overridden = COALESCE((p_updates->>'invoice_month_overridden')::BOOLEAN, invoice_month_overridden),
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
$function$;