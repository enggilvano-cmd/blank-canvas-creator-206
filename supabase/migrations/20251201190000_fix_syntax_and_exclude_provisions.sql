-- Consolidated Fix: Syntax Error Fix + Provision Logic + Exclude Overspent Provisions
-- Run this entire script in the Supabase SQL Editor to fix the "RETURN QUERY" error and apply all changes.

-- 1. Ensure the column exists
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_provision BOOLEAN DEFAULT false;

-- 2. Drop old function signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.atomic_create_fixed_transaction(uuid, text, numeric, date, transaction_type, uuid, uuid, transaction_status);
DROP FUNCTION IF EXISTS public.atomic_create_fixed_transaction(uuid, text, numeric, date, transaction_type, uuid, uuid, transaction_status, boolean);

-- 3. Create the main function for creating fixed transactions (Rewritten with RETURN NEXT to avoid syntax errors)
CREATE OR REPLACE FUNCTION public.atomic_create_fixed_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type public.transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status public.transaction_status,
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
  -- Validar período bloqueado
  IF is_period_locked(p_user_id, p_date) THEN
    success := false;
    error_message := 'Period is locked for initial transaction date';
    created_count := 0;
    parent_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Calcular amount com sinal correto
  v_calculated_amount := CASE 
    WHEN p_type = 'expense' THEN -ABS(p_amount)
    ELSE ABS(p_amount)
  END;

  v_day_of_month := EXTRACT(DAY FROM p_date);
  v_current_year := EXTRACT(YEAR FROM p_date);
  v_current_month := EXTRACT(MONTH FROM p_date);
  v_months_to_create := (12 - v_current_month + 1) + 12;

  -- Criar transação parent
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, 'pending', true, p_is_provision
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Se for provisão, descontar transações existentes
  IF p_is_provision THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_amount
    FROM transactions
    WHERE user_id = p_user_id
      AND category_id = p_category_id
      AND date_trunc('month', date) = date_trunc('month', p_date)
      AND is_provision = false;
      
    v_calculated_amount := v_calculated_amount - v_existing_amount;
  END IF;

  -- Criar primeira filha
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, parent_transaction_id, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true, v_parent_id, p_is_provision
  );

  v_calculated_amount := CASE 
    WHEN p_type = 'expense' THEN -ABS(p_amount)
    ELSE ABS(p_amount)
  END;

  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  v_count := v_count + 1;
  v_current_date := p_date;

  -- Criar filhas subsequentes
  FOR i IN 2..v_months_to_create LOOP
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;
    
    IF EXTRACT(DAY FROM v_current_date) != v_day_of_month THEN
      v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;

    IF is_period_locked(p_user_id, v_current_date) THEN
      EXIT;
    END IF;

    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id,
      status, is_fixed, parent_transaction_id, is_provision
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, v_current_date, p_type, p_category_id,
      p_account_id, 'pending', true, v_parent_id, p_is_provision
    );

    v_count := v_count + 1;
  END LOOP;

  success := true;
  error_message := NULL;
  created_count := v_count;
  parent_id := v_parent_id;
  RETURN NEXT;

EXCEPTION
  WHEN OTHERS THEN
    success := false;
    error_message := SQLERRM;
    created_count := 0;
    parent_id := NULL;
    RETURN NEXT;
END;
$$;

-- 4. Create Trigger Function for automatic deduction
CREATE OR REPLACE FUNCTION public.handle_provision_deduction()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $trigger$
DECLARE
  v_provision_id UUID;
  v_provision_account_id UUID;
  v_provision_status public.transaction_status;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_provision THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
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

      IF v_provision_status = 'completed' THEN
        PERFORM recalculate_account_balance(v_provision_account_id);
      END IF;
    END IF;
    
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_provision THEN
      RETURN OLD;
    END IF;

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

      IF v_provision_status = 'completed' THEN
        PERFORM recalculate_account_balance(v_provision_account_id);
      END IF;
    END IF;

    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.category_id != NEW.category_id OR 
       date_trunc('month', OLD.date) != date_trunc('month', NEW.date) OR
       OLD.amount != NEW.amount THEN
       
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

         IF v_provision_status = 'completed' THEN
           PERFORM recalculate_account_balance(v_provision_account_id);
         END IF;
       END IF;

       v_provision_id := NULL;
       
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

         IF v_provision_status = 'completed' THEN
           PERFORM recalculate_account_balance(v_provision_account_id);
         END IF;
       END IF;
       
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$trigger$ LANGUAGE plpgsql;

-- 5. Create Trigger
DROP TRIGGER IF EXISTS trigger_deduct_provision ON public.transactions;
CREATE TRIGGER trigger_deduct_provision
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_provision_deduction();

-- 6. Create Cleanup Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_provisions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM transactions
  WHERE user_id = p_user_id
    AND is_provision = true
    AND date < DATE_TRUNC('month', CURRENT_DATE);
END;
$$;

-- 7. Update get_transactions_totals to exclude overspent provisions (positive amount)
CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id UUID,
  p_type TEXT DEFAULT 'all',
  p_status TEXT DEFAULT 'all',
  p_account_id TEXT DEFAULT 'all',
  p_category_id TEXT DEFAULT 'all',
  p_account_type TEXT DEFAULT 'all',
  p_is_fixed BOOLEAN DEFAULT NULL,
  p_is_provision BOOLEAN DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_income NUMERIC,
  total_expenses NUMERIC,
  balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      t.category_id,
      t.description,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- SEMPRE excluir transferências
      AND t.to_account_id IS NULL
      AND t.linked_transaction_id IS NULL
      -- Excluir apenas o PAI das transações fixas
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- NOVA REGRA: Excluir provisões estouradas (saldo positivo)
      AND NOT (t.is_provision IS TRUE AND t.amount > 0)
      -- Filtros de is_fixed e is_provision
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      AND (p_is_provision IS NULL OR t.is_provision = p_is_provision)
      -- Filtros normais
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
  )
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as total_expenses,
    COALESCE(
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 
      0
    ) as balance
  FROM filtered_transactions;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;