-- Função atômica para criar transação recorrente com validação de período bloqueado
CREATE OR REPLACE FUNCTION public.atomic_create_recurring_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status transaction_status,
  p_recurrence_type recurrence_type,
  p_recurrence_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  created_count INTEGER,
  parent_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_current_date DATE;
  v_end_date DATE;
  v_count INTEGER := 0;
  v_transaction_result RECORD;
  v_calculated_amount NUMERIC;
BEGIN
  -- Validar período bloqueado da primeira transação
  IF is_period_locked(p_user_id, p_date) THEN
    RETURN QUERY SELECT false, 'Period is locked for initial transaction date'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  -- Calcular amount com sinal correto
  v_calculated_amount := CASE 
    WHEN p_type = 'expense' THEN -ABS(p_amount)
    ELSE ABS(p_amount)
  END;

  -- Definir data final (máximo 1 ano se não especificado)
  v_end_date := COALESCE(
    p_recurrence_end_date,
    p_date + INTERVAL '1 year'
  );

  -- Criar transação parent (primeira da série)
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_recurring, recurrence_type, recurrence_end_date
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true, p_recurrence_type, v_end_date
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Recalcular saldo se completed
  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  -- Gerar transações filhas
  v_current_date := p_date;
  
  LOOP
    -- Calcular próxima data baseado no tipo de recorrência
    CASE p_recurrence_type
      WHEN 'daily' THEN
        v_current_date := v_current_date + INTERVAL '1 day';
      WHEN 'weekly' THEN
        v_current_date := v_current_date + INTERVAL '1 week';
      WHEN 'monthly' THEN
        v_current_date := v_current_date + INTERVAL '1 month';
      WHEN 'yearly' THEN
        v_current_date := v_current_date + INTERVAL '1 year';
    END CASE;

    -- Parar se ultrapassar data final
    EXIT WHEN v_current_date > v_end_date;

    -- CRÍTICO: Validar período bloqueado antes de criar cada transação
    IF is_period_locked(p_user_id, v_current_date) THEN
      -- Não criar mais transações em períodos bloqueados, mas não falhar
      EXIT;
    END IF;

    -- Criar transação filha
    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id,
      status, is_recurring, recurrence_type, parent_transaction_id
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, v_current_date, p_type, p_category_id,
      p_account_id, p_status, true, p_recurrence_type, v_parent_id
    );

    v_count := v_count + 1;

    -- Recalcular saldo se completed
    IF p_status = 'completed' THEN
      PERFORM recalculate_account_balance(p_account_id);
    END IF;

    -- Limite de segurança: máximo 365 transações
    EXIT WHEN v_count >= 365;
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT, v_count, v_parent_id;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, 0, NULL::UUID;
END;
$$;