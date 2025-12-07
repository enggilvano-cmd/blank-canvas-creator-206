-- Força transações fixas principais a sempre serem criadas como 'pending'
-- Isso garante que elas sempre possam ser editadas pela página de Transações Fixas
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
  v_current_year INTEGER;
  v_current_month INTEGER;
  v_months_to_create INTEGER;
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

  -- Extrair informações da data inicial
  v_day_of_month := EXTRACT(DAY FROM p_date);
  v_current_year := EXTRACT(YEAR FROM p_date);
  v_current_month := EXTRACT(MONTH FROM p_date);

  -- Calcular quantos meses criar:
  -- Meses restantes do ano atual (incluindo mês atual) + 12 meses do ano seguinte
  v_months_to_create := (12 - v_current_month + 1) + 12;

  -- CRÍTICO: Criar transação parent SEMPRE como 'pending' para permitir edição posterior
  -- O parâmetro p_status é ignorado - todas as fixas principais são 'pending'
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, 'pending', true
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Não recalcular saldo pois a primeira transação é sempre 'pending'

  -- Gerar transações para os meses restantes do ano corrente + 12 meses do ano subsequente
  -- TODAS as transações futuras serão criadas como PENDING
  v_current_date := p_date;
  
  -- Loop para criar todas as transações filhas
  FOR i IN 1..(v_months_to_create - 1) LOOP
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
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT, v_count, v_parent_id;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, 0, NULL::UUID;
END;
$$;