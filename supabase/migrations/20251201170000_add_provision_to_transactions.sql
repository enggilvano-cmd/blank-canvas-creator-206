-- Add is_provision column to transactions table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_provision BOOLEAN DEFAULT false;

-- Update atomic_create_fixed_transaction to accept p_is_provision
CREATE OR REPLACE FUNCTION public.atomic_create_fixed_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status transaction_status,
  p_is_provision BOOLEAN DEFAULT false
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

  -- Criar transação parent SEMPRE como 'pending' (para edição na página Fixas)
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, 'pending', true, p_is_provision
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Criar PRIMEIRA FILHA com a MESMA DATA da parent
  -- Status do formulário, aparece na página Transações
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, parent_transaction_id, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true, v_parent_id, p_is_provision
  );

  -- Recalcular saldo apenas se a primeira filha for 'completed'
  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  v_count := v_count + 1;

  -- Inicializar v_current_date com p_date para começar a incrementar
  v_current_date := p_date;

  -- Gerar transações filhas para os meses subsequentes (sempre 'pending')
  -- Começa do segundo mês em diante (segunda filha)
  FOR i IN 2..v_months_to_create LOOP
    -- Avançar para o próximo mês ANTES de criar a transação
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;
    
    -- Ajustar para o último dia do mês se o dia não existir
    IF EXTRACT(DAY FROM v_current_date) != v_day_of_month THEN
      v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;

    -- Validar período bloqueado
    IF is_period_locked(p_user_id, v_current_date) THEN
      EXIT;
    END IF;

    -- Criar transações filhas SEMPRE como 'pending'
    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id,
      status, is_fixed, parent_transaction_id, is_provision
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, v_current_date, p_type, p_category_id,
      p_account_id, 'pending', true, v_parent_id, p_is_provision
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT, v_count, v_parent_id;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, 0, NULL::UUID;
END;
$$;

-- Function to clean up expired provisions (previous months)
CREATE OR REPLACE FUNCTION public.cleanup_expired_provisions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete provisions from previous months
  -- Only deletes transactions marked as provision that are older than the current month
  DELETE FROM transactions
  WHERE user_id = p_user_id
    AND is_provision = true
    AND date < DATE_TRUNC('month', CURRENT_DATE);
END;
$$;
