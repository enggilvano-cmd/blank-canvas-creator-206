-- ========================================
-- CORREÇÃO: Função atomic_create_transaction
-- PROBLEMA: Saldo não era recalculado quando journal entries não eram criados
-- SOLUÇÃO: Sempre recalcular saldo para transações completed, independente de journal entries
-- ========================================

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

    -- 2. Criar journal entries se status = completed (opcional, apenas para contabilidade)
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
    END IF;

    -- 3. ⚠️ CORREÇÃO: SEMPRE recalcular saldo para transações completed
    IF p_status = 'completed' THEN
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

COMMENT ON FUNCTION public.atomic_create_transaction IS 'Cria transação com journal entries opcionais e SEMPRE recalcula saldo para transações completed';

-- ========================================
-- Recalcular saldos de TODAS as contas com transações completed
-- ========================================

DO $$
DECLARE
  v_account RECORD;
  v_result RECORD;
BEGIN
  RAISE NOTICE 'Iniciando recálculo de saldos para todas as contas...';
  
  FOR v_account IN 
    SELECT DISTINCT a.id, a.name, a.user_id
    FROM accounts a
    INNER JOIN transactions t ON t.account_id = a.id
    WHERE t.status = 'completed'
  LOOP
    BEGIN
      SELECT * INTO v_result 
      FROM recalculate_account_balance(v_account.id);
      
      IF v_result.success THEN
        RAISE NOTICE 'Conta % (%) atualizada: novo saldo = %', 
          v_account.name, v_account.id, v_result.new_balance;
      ELSE
        RAISE WARNING 'Falha ao recalcular conta % (%): %', 
          v_account.name, v_account.id, v_result.error_message;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Erro ao recalcular conta % (%): %', 
          v_account.name, v_account.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Recálculo de saldos concluído!';
END;
$$;