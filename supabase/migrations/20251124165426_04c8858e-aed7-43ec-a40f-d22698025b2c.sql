-- Update atomic_create_transaction to use category's chart_account_id mapping
-- This ensures transactions are correctly classified in financial reports

CREATE OR REPLACE FUNCTION public.atomic_create_transaction(
  p_user_id uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_type transaction_type,
  p_category_id uuid,
  p_account_id uuid,
  p_status transaction_status,
  p_invoice_month text DEFAULT NULL,
  p_invoice_month_overridden boolean DEFAULT false
)
RETURNS TABLE(
  transaction_id uuid,
  new_balance numeric,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_recalc_result RECORD;
  v_category_chart_account_id UUID;
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

  -- Validar limite de crédito para cartões (INCLUINDO PENDING)
  IF v_account_type = 'credit' AND p_type = 'expense' THEN
    DECLARE
      v_current_debt NUMERIC;
      v_pending_expenses NUMERIC;
      v_total_debt NUMERIC;
      v_available_credit NUMERIC;
    BEGIN
      v_current_debt := ABS(LEAST(v_account_balance, 0));
      
      SELECT COALESCE(SUM(ABS(amount)), 0)
      INTO v_pending_expenses
      FROM transactions
      WHERE account_id = p_account_id 
        AND user_id = p_user_id
        AND type = 'expense'
        AND status = 'pending';
      
      v_total_debt := v_current_debt + v_pending_expenses;
      v_available_credit := COALESCE(v_account_limit, 0) - v_total_debt;
      
      IF ABS(v_calculated_amount) > v_available_credit THEN
        RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, 
          format('Credit limit exceeded. Available: %s (Limit: %s - Used: %s - Pending: %s), Requested: %s', 
            v_available_credit, 
            COALESCE(v_account_limit, 0),
            v_current_debt,
            v_pending_expenses,
            ABS(v_calculated_amount))::TEXT;
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
      -- Buscar conta contábil mapeada na categoria
      SELECT chart_account_id INTO v_category_chart_account_id
      FROM categories
      WHERE id = p_category_id AND user_id = p_user_id;

      -- Mapear conta bancária para conta contábil
      IF v_account_type = 'checking' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.02' AND is_active = true LIMIT 1;
      ELSIF v_account_type = 'savings' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.03' AND is_active = true LIMIT 1;
      ELSIF v_account_type = 'investment' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '1.01.04' AND is_active = true LIMIT 1;
      ELSIF v_account_type = 'credit' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code = '2.01.01' AND is_active = true LIMIT 1;
      END IF;

      -- Fallback para qualquer ativo
      IF v_asset_account_id IS NULL THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = p_user_id AND code LIKE '1.01.%' AND is_active = true
        ORDER BY code LIMIT 1;
      END IF;

      IF v_asset_account_id IS NOT NULL THEN
        IF p_type = 'income' THEN
          -- Usar conta mapeada na categoria, ou fallback para primeira conta de receita
          IF v_category_chart_account_id IS NOT NULL THEN
            v_revenue_account_id := v_category_chart_account_id;
          ELSE
            SELECT id INTO v_revenue_account_id FROM chart_of_accounts 
            WHERE user_id = p_user_id AND category = 'revenue' AND is_active = true
            ORDER BY code LIMIT 1;
          END IF;

          IF v_revenue_account_id IS NOT NULL THEN
            INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
            VALUES 
              (p_user_id, v_transaction_id, v_asset_account_id, 'debit', ABS(v_calculated_amount), p_description, p_date),
              (p_user_id, v_transaction_id, v_revenue_account_id, 'credit', ABS(v_calculated_amount), p_description, p_date);
          END IF;
        ELSE
          -- Usar conta mapeada na categoria, ou fallback para primeira conta de despesa
          IF v_category_chart_account_id IS NOT NULL THEN
            v_expense_account_id := v_category_chart_account_id;
          ELSE
            SELECT id INTO v_expense_account_id FROM chart_of_accounts 
            WHERE user_id = p_user_id AND category = 'expense' AND is_active = true
            ORDER BY code LIMIT 1;
          END IF;

          IF v_expense_account_id IS NOT NULL THEN
            INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
            VALUES 
              (p_user_id, v_transaction_id, v_expense_account_id, 'debit', ABS(v_calculated_amount), p_description, p_date),
              (p_user_id, v_transaction_id, v_asset_account_id, 'credit', ABS(v_calculated_amount), p_description, p_date);
          END IF;
        END IF;
      END IF;
    END IF;

    -- 3. Recalcular saldo para transações completed
    IF p_status = 'completed' THEN
      SELECT * INTO v_recalc_result
      FROM recalculate_account_balance(p_account_id)
      LIMIT 1;

      IF v_recalc_result.success THEN
        v_new_balance := v_recalc_result.new_balance;
      ELSE
        RAISE EXCEPTION 'Failed to recalculate account balance';
      END IF;
    END IF;

    -- Retornar sucesso
    RETURN QUERY SELECT v_transaction_id, v_new_balance, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT NULL::UUID, NULL::NUMERIC, false, SQLERRM::TEXT;
  END;
END;
$function$;