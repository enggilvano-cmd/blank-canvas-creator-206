-- Fix fixed transactions to only set first transaction with user status
-- All future transactions should be pending
CREATE OR REPLACE FUNCTION public.atomic_create_fixed_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status transaction_status
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
  v_count INTEGER := 0;
  v_calculated_amount NUMERIC;
  v_day_of_month INTEGER;
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

  -- Extrair dia do mês da data inicial
  v_day_of_month := EXTRACT(DAY FROM p_date);

  -- Criar transação parent (primeira da série) com o status fornecido pelo usuário
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Recalcular saldo apenas se a primeira transação for completed
  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  -- Gerar transações fixas para os próximos 12 meses
  -- TODAS as transações futuras serão criadas como PENDING
  v_current_date := p_date;
  
  FOR i IN 1..11 LOOP
    -- Avançar para o próximo mês, mantendo o dia
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;
    
    -- Ajustar para o último dia do mês se o dia não existir (ex: 31 em fevereiro)
    IF EXTRACT(DAY FROM v_current_date) != v_day_of_month THEN
      v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;

    -- CRÍTICO: Validar período bloqueado antes de criar cada transação
    IF is_period_locked(p_user_id, v_current_date) THEN
      -- Não criar mais transações em períodos bloqueados, mas não falhar
      EXIT;
    END IF;

    -- Criar transação filha SEMPRE como PENDING (transações futuras)
    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id,
      status, is_fixed, parent_transaction_id
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, v_current_date, p_type, p_category_id,
      p_account_id, 'pending', true, v_parent_id
    );

    v_count := v_count + 1;

    -- NÃO recalcular saldo para transações pending (futuras)
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT, v_count, v_parent_id;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, 0, NULL::UUID;
END;
$$;