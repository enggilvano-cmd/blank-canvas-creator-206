-- Drop old function signature to avoid conflicts
DROP FUNCTION IF EXISTS public.atomic_create_fixed_transaction(uuid, text, numeric, date, transaction_type, uuid, uuid, transaction_status);

-- Ensure column exists
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_provision BOOLEAN DEFAULT false;

-- Update atomic_create_fixed_transaction
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
  v_existing_amount NUMERIC := 0;
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
    -- Ex: Provisão -1000, Existente -150. Resultado: -1000 - (-150) = -850.
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

-- Trigger Function for Provision Deduction
CREATE OR REPLACE FUNCTION public.handle_provision_deduction()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provision_id UUID;
  v_provision_account_id UUID;
  v_provision_status transaction_status;
BEGIN
  -- Ignore if the transaction itself is a provision
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_provision THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    -- Find matching provision (prefer child transactions/instances)
    SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
    FROM transactions
    WHERE user_id = NEW.user_id
      AND category_id = NEW.category_id
      AND is_provision = true
      AND date_trunc('month', date) = date_trunc('month', NEW.date)
      AND id != NEW.id
      AND parent_transaction_id IS NOT NULL
    LIMIT 1
    FOR UPDATE;

    IF v_provision_id IS NOT NULL THEN
      UPDATE transactions
      SET amount = amount - NEW.amount
      WHERE id = v_provision_id;

      -- Recalculate balance if provision was completed
      IF v_provision_status = 'completed' THEN
        PERFORM recalculate_account_balance(v_provision_account_id);
      END IF;
    END IF;
    
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Ignore if the deleted transaction was a provision
    IF OLD.is_provision THEN
      RETURN OLD;
    END IF;

    -- Find matching provision (using OLD data)
    SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
    FROM transactions
    WHERE user_id = OLD.user_id
      AND category_id = OLD.category_id
      AND is_provision = true
      AND date_trunc('month', date) = date_trunc('month', OLD.date)
      AND parent_transaction_id IS NOT NULL
    LIMIT 1
    FOR UPDATE;

    IF v_provision_id IS NOT NULL THEN
      UPDATE transactions
      SET amount = amount + OLD.amount
      WHERE id = v_provision_id;

      -- Recalculate balance if provision was completed
      IF v_provision_status = 'completed' THEN
        PERFORM recalculate_account_balance(v_provision_account_id);
      END IF;
    END IF;

    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if relevant fields changed
    IF OLD.category_id != NEW.category_id OR 
       date_trunc('month', OLD.date) != date_trunc('month', NEW.date) OR
       OLD.amount != NEW.amount THEN
       
       -- 1. Refund OLD provision
       SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
       FROM transactions
       WHERE user_id = OLD.user_id
         AND category_id = OLD.category_id
         AND is_provision = true
         AND date_trunc('month', date) = date_trunc('month', OLD.date)
         AND parent_transaction_id IS NOT NULL
       LIMIT 1
       FOR UPDATE;

       IF v_provision_id IS NOT NULL THEN
         UPDATE transactions
         SET amount = amount + OLD.amount
         WHERE id = v_provision_id;

         -- Recalculate balance if provision was completed
         IF v_provision_status = 'completed' THEN
           PERFORM recalculate_account_balance(v_provision_account_id);
         END IF;
       END IF;

       -- 2. Deduct from NEW provision
       v_provision_id := NULL; -- Reset
       
       SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
       FROM transactions
       WHERE user_id = NEW.user_id
         AND category_id = NEW.category_id
         AND is_provision = true
         AND date_trunc('month', date) = date_trunc('month', NEW.date)
         AND parent_transaction_id IS NOT NULL
       LIMIT 1
       FOR UPDATE;

       IF v_provision_id IS NOT NULL THEN
         UPDATE transactions
         SET amount = amount - NEW.amount
         WHERE id = v_provision_id;

         -- Recalculate balance if provision was completed
         IF v_provision_status = 'completed' THEN
           PERFORM recalculate_account_balance(v_provision_account_id);
         END IF;
       END IF;
       
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
DROP TRIGGER IF EXISTS trigger_deduct_provision ON public.transactions;
CREATE TRIGGER trigger_deduct_provision
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_provision_deduction();

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
