-- ========================================
-- FUNÇÕES PL/pgSQL COM TRANSAÇÕES EXPLÍCITAS
-- ========================================

-- 1. Função para criar transação atomicamente
CREATE OR REPLACE FUNCTION public.atomic_create_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status transaction_status,
  p_invoice_month TEXT DEFAULT NULL,
  p_invoice_month_overridden BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  transaction_id UUID,
  new_balance NUMERIC,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_account_type account_type;
  v_account_balance NUMERIC;
  v_account_limit NUMERIC;
  v_calculated_amount NUMERIC;
  v_new_balance NUMERIC;
  v_asset_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
BEGIN
  -- Validar período não está fechado
  IF is_period_locked(p_user_id, p_date) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, 'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Buscar dados da conta
  SELECT type, balance, limit_amount 
  INTO v_account_type, v_account_balance, v_account_limit
  FROM accounts 
  WHERE id = p_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- Calcular amount com sinal correto
  v_calculated_amount := CASE 
    WHEN p_type = 'expense' THEN -ABS(p_amount)
    ELSE ABS(p_amount)
  END;

  -- Validar limite de crédito se aplicável
  IF v_account_type = 'credit' AND p_type = 'expense' AND p_status = 'completed' THEN
    DECLARE
      v_current_debt NUMERIC;
      v_available_credit NUMERIC;
    BEGIN
      v_current_debt := ABS(LEAST(v_account_balance, 0));
      v_available_credit := COALESCE(v_account_limit, 0) - v_current_debt;
      
      IF ABS(v_calculated_amount) > v_available_credit THEN
        RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, 
          format('Credit limit exceeded. Available: %s, Requested: %s', v_available_credit, ABS(v_calculated_amount))::TEXT;
        RETURN;
      END IF;
    END;
  END IF;

  -- INÍCIO DA TRANSAÇÃO EXPLÍCITA
  BEGIN
    -- 1. Inserir transação
    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id, 
      status, invoice_month, invoice_month_overridden
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id, 
      p_account_id, p_status, p_invoice_month, p_invoice_month_overridden
    ) RETURNING id INTO v_transaction_id;

    -- 2. Criar journal entries se status = completed
    IF p_status = 'completed' THEN
      -- Mapear conta bancária para conta contábil (asset/liability)
      IF v_account_type = 'checking' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.02' LIMIT 1;
      ELSIF v_account_type = 'savings' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.03' LIMIT 1;
      ELSIF v_account_type = 'investment' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.04' LIMIT 1;
      ELSIF v_account_type = 'credit' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '2.01.01' LIMIT 1;
      END IF;

      -- Fallback para qualquer ativo
      IF v_asset_account_id IS NULL THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code LIKE '1.01.%' 
        ORDER BY code LIMIT 1;
      END IF;

      IF v_asset_account_id IS NOT NULL THEN
        IF p_type = 'income' THEN
          -- Buscar conta de receita
          SELECT id INTO v_revenue_account_id FROM chart_of_accounts 
          WHERE user_id = p_user_id AND category = 'revenue' 
          ORDER BY code LIMIT 1;

          IF v_revenue_account_id IS NOT NULL THEN
            -- Débito: Ativo | Crédito: Receita
            INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
            VALUES 
              (p_user_id, v_transaction_id, v_asset_account_id, 'debit', ABS(v_calculated_amount), p_description, p_date),
              (p_user_id, v_transaction_id, v_revenue_account_id, 'credit', ABS(v_calculated_amount), p_description, p_date);
          END IF;
        ELSE
          -- Buscar conta de despesa
          SELECT id INTO v_expense_account_id FROM chart_of_accounts 
          WHERE user_id = p_user_id AND category = 'expense' 
          ORDER BY code LIMIT 1;

          IF v_expense_account_id IS NOT NULL THEN
            -- Débito: Despesa | Crédito: Ativo/Passivo
            INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
            VALUES 
              (p_user_id, v_transaction_id, v_expense_account_id, 'debit', ABS(v_calculated_amount), p_description, p_date),
              (p_user_id, v_transaction_id, v_asset_account_id, 'credit', ABS(v_calculated_amount), p_description, p_date);
          END IF;
        END IF;
      END IF;

      -- 3. Recalcular saldo da conta
      SELECT new_balance INTO v_new_balance
      FROM recalculate_account_balance(p_account_id)
      WHERE success = true;

      IF v_new_balance IS NULL THEN
        RAISE EXCEPTION 'Failed to recalculate account balance';
      END IF;
    END IF;

    -- Retornar sucesso
    RETURN QUERY SELECT v_transaction_id, v_new_balance, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback automático em caso de erro
      RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, SQLERRM::TEXT;
  END;
END;
$$;

-- 2. Função para criar transferência atomicamente
CREATE OR REPLACE FUNCTION public.atomic_create_transfer(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_date DATE,
  p_status transaction_status
)
RETURNS TABLE(
  outgoing_transaction_id UUID,
  incoming_transaction_id UUID,
  from_balance NUMERIC,
  to_balance NUMERIC,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_type account_type;
  v_to_type account_type;
  v_from_limit NUMERIC;
  v_to_limit NUMERIC;
BEGIN
  -- Validar contas diferentes
  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false, 
      'Source and destination accounts must be different'::TEXT;
    RETURN;
  END IF;

  -- Validar período não está fechado
  IF is_period_locked(p_user_id, p_date) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false, 
      'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Buscar contas
  SELECT type, balance, limit_amount INTO v_from_type, v_from_balance, v_from_limit
  FROM accounts WHERE id = p_from_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false, 
      'Source account not found'::TEXT;
    RETURN;
  END IF;

  SELECT type, balance, limit_amount INTO v_to_type, v_to_balance, v_to_limit
  FROM accounts WHERE id = p_to_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false, 
      'Destination account not found'::TEXT;
    RETURN;
  END IF;

  -- Validar limites
  IF v_from_type = 'credit' AND p_status = 'completed' THEN
    DECLARE
      v_current_debt NUMERIC := ABS(LEAST(v_from_balance, 0));
      v_available NUMERIC := COALESCE(v_from_limit, 0) - v_current_debt;
    BEGIN
      IF p_amount > v_available THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false,
          format('Credit limit exceeded on source account. Available: %s', v_available)::TEXT;
        RETURN;
      END IF;
    END;
  END IF;

  -- INÍCIO DA TRANSAÇÃO EXPLÍCITA
  BEGIN
    -- 1. Criar transação de saída (expense)
    INSERT INTO transactions (
      user_id, description, amount, date, type, account_id, to_account_id, status
    ) VALUES (
      p_user_id, p_description, -ABS(p_amount), p_date, 'expense', p_from_account_id, p_to_account_id, p_status
    ) RETURNING id INTO v_outgoing_id;

    -- 2. Criar transação de entrada (income)
    INSERT INTO transactions (
      user_id, description, amount, date, type, account_id, linked_transaction_id, status
    ) VALUES (
      p_user_id, p_description, ABS(p_amount), p_date, 'income', p_to_account_id, v_outgoing_id, p_status
    ) RETURNING id INTO v_incoming_id;

    -- 3. Atualizar linked_transaction_id na transação de saída
    UPDATE transactions 
    SET linked_transaction_id = v_incoming_id 
    WHERE id = v_outgoing_id;

    -- 4. Recalcular saldos se completed
    IF p_status = 'completed' THEN
      SELECT new_balance INTO v_from_balance
      FROM recalculate_account_balance(p_from_account_id)
      WHERE success = true;

      SELECT new_balance INTO v_to_balance
      FROM recalculate_account_balance(p_to_account_id)
      WHERE success = true;

      IF v_from_balance IS NULL OR v_to_balance IS NULL THEN
        RAISE EXCEPTION 'Failed to recalculate account balances';
      END IF;
    END IF;

    -- Retornar sucesso
    RETURN QUERY SELECT v_outgoing_id, v_incoming_id, v_from_balance, v_to_balance, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, false, SQLERRM::TEXT;
  END;
END;
$$;

-- 3. Função para deletar transação atomicamente
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

    -- 2. Deletar transações
    DELETE FROM transactions
    WHERE id = ANY(v_transaction_ids)
    RETURNING * INTO v_deleted_count;

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

-- 4. Função para atualizar transação atomicamente
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
BEGIN
  -- Buscar transação
  SELECT date, parent_transaction_id, current_installment, account_id
  INTO v_transaction_date, v_parent_id, v_current_installment, v_old_account_id
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

    -- Atualizar transações dinamicamente baseado no JSONB
    UPDATE transactions SET
      description = COALESCE((p_updates->>'description')::TEXT, description),
      amount = COALESCE((p_updates->>'amount')::NUMERIC, amount),
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

-- Comentários das funções
COMMENT ON FUNCTION public.atomic_create_transaction IS 'Cria transação com journal entries e recalcula saldo atomicamente';
COMMENT ON FUNCTION public.atomic_create_transfer IS 'Cria transferência entre contas com transações vinculadas atomicamente';
COMMENT ON FUNCTION public.atomic_delete_transaction IS 'Deleta transação(ões) com journal entries e recalcula saldos atomicamente';
COMMENT ON FUNCTION public.atomic_update_transaction IS 'Atualiza transação(ões) e recalcula saldos atomicamente';