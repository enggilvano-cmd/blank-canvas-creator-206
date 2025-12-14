-- Fix atomic_create_fixed_transaction to properly handle provisions and create child transactions
-- Step 2: Recreate function with complete logic

CREATE OR REPLACE FUNCTION public.atomic_create_fixed_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type public.transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status public.transaction_status DEFAULT 'pending'::public.transaction_status,
  p_is_provision BOOLEAN DEFAULT false
)
RETURNS TABLE(
  success BOOLEAN,
  parent_id UUID,
  created_count INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent_id UUID;
  v_account_type TEXT;
  v_current_date DATE;
  v_count INTEGER := 0;
  v_calculated_amount NUMERIC;
  v_day_of_month INTEGER;
  v_current_year INTEGER;
  v_current_month INTEGER;
  v_months_to_create INTEGER;
  v_existing_amount NUMERIC := 0;
BEGIN
  -- ✅ BUG FIX #5: Validar user_id PRIMEIRO
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Unauthorized: user_id validation failed'::TEXT;
    RETURN;
  END IF;

  -- Validar account ownership
  SELECT type INTO v_account_type
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Account not found or does not belong to user'::TEXT;
    RETURN;
  END IF;

  -- Validar category ownership (se fornecido)
  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM categories 
      WHERE id = p_category_id AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, 0, 'Category not found or does not belong to user'::TEXT;
      RETURN;
    END IF;
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

  -- Criar transação parent SEMPRE como 'pending'
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, 'pending', true, p_is_provision
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Se for provisão, calcular desconto de transações JÁ EXISTENTES no mês
  IF p_is_provision THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_amount
    FROM transactions
    WHERE user_id = p_user_id
      AND category_id = p_category_id
      AND date_trunc('month', date) = date_trunc('month', p_date)
      AND is_provision = false; -- Não descontar outras provisões (se houver)
      
    -- Subtrair o valor existente do valor da provisão
    v_calculated_amount := v_calculated_amount - v_existing_amount;
  END IF;

  -- Criar PRIMEIRA FILHA com a MESMA DATA da parent (mas com valor ajustado se for provisão)
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, parent_transaction_id, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true, v_parent_id, p_is_provision
  );

  -- Restaurar valor original para as próximas parcelas
  v_calculated_amount := CASE 
    WHEN p_type = 'expense' THEN -ABS(p_amount)
    ELSE ABS(p_amount)
  END;

  -- Recalcular saldo apenas se a primeira filha for 'completed'
  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  v_count := v_count + 1;

  -- Inicializar v_current_date com p_date para começar a incrementar
  v_current_date := p_date;

  -- Gerar transações filhas para os meses subsequentes
  FOR i IN 2..v_months_to_create LOOP
    -- Avançar para o próximo mês ANTES de criar a transação
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;
    
    -- Ajustar para o último dia do mês se o dia não existir
    IF EXTRACT(DAY FROM v_current_date) != v_day_of_month THEN
      v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
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

  RETURN QUERY SELECT true, v_parent_id, v_count, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, 0, SQLERRM::TEXT;
END;
$$;
