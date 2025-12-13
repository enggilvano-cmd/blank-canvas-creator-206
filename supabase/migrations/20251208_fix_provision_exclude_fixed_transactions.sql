-- ============================================================
-- Fix: Provisions should NEVER include fixed transactions
-- 1. Fixed transactions should NOT deduct from provisions (trigger fix)
-- 2. When creating provisions, do NOT discount existing fixed transactions (function fix)
--
-- ROLLBACK INSTRUCTIONS:
-- Se precisar reverter esta migration, execute:
-- 1. DROP FUNCTION IF EXISTS public.handle_provision_deduction() CASCADE;
-- 2. DROP FUNCTION IF EXISTS public.create_provisions_for_category_month();
-- 3. Restaure as versões anteriores das funções do backup
-- 4. Execute: SELECT recalculate_all_account_balances();
-- ============================================================

BEGIN;

-- Part 1: Fix the trigger to ignore fixed transactions
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
  -- Ignore if the transaction itself is a provision
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_provision THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    -- ONLY deduct if the new transaction is 'completed' AND NOT a fixed transaction
    IF NEW.status != 'completed' OR NEW.is_fixed = true THEN
      RETURN NEW;
    END IF;

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

      IF v_provision_status = 'completed' THEN
        PERFORM recalculate_account_balance(v_provision_account_id);
      END IF;
    END IF;
    
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Ignore provision deletions
    IF OLD.is_provision THEN
      RETURN OLD;
    END IF;

    -- ONLY refund if the deleted transaction was 'completed' AND NOT a fixed transaction
    IF OLD.status != 'completed' OR OLD.is_fixed = true THEN
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
    -- Handle status change from 'pending' to 'completed' or vice versa
    IF OLD.status != NEW.status THEN
      -- Changed from pending to completed: deduct from provision (only if NOT fixed)
      IF OLD.status = 'pending' AND NEW.status = 'completed' AND NEW.is_fixed = false THEN
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

        RETURN NEW;
      END IF;

      -- Changed from completed to pending: refund to provision (only if NOT fixed)
      IF OLD.status = 'completed' AND NEW.status = 'pending' AND OLD.is_fixed = false THEN
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
          SET amount = amount + NEW.amount
          WHERE id = v_provision_id;

          IF v_provision_status = 'completed' THEN
            PERFORM recalculate_account_balance(v_provision_account_id);
          END IF;
        END IF;

        RETURN NEW;
      END IF;
    END IF;

    -- Handle category, date, or amount changes (only for completed AND non-fixed transactions)
    IF OLD.status = 'completed' AND OLD.is_fixed = false AND (
       OLD.category_id != NEW.category_id OR 
       date_trunc('month', OLD.date) != date_trunc('month', NEW.date) OR
       OLD.amount != NEW.amount
    ) THEN
       
       -- Refund OLD provision
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

       -- Deduct from NEW provision (only if still completed and not fixed)
       IF NEW.status = 'completed' AND NEW.is_fixed = false THEN
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
       
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$trigger$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.handle_provision_deduction IS 
'Trigger para deduzir transações das provisões automaticamente.
IMPORTANTE: 
- Apenas transações com status "completed" são deduzidas.
- Transações "pending" NÃO afetam as provisões até serem marcadas como "completed".
- Transações FIXAS (is_fixed = true) NUNCA são deduzidas das provisões.
- Provisões são apenas para transações normais (não fixas).';

-- Part 2: Fix atomic_create_fixed_transaction to exclude fixed transactions when calculating provision amount
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

  -- Se for provisão, descontar transações existentes (EXCETO FIXAS e COMPLETED)
  IF p_is_provision THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_amount
    FROM transactions
    WHERE user_id = p_user_id
      AND category_id = p_category_id
      AND date_trunc('month', date) = date_trunc('month', p_date)
      AND is_provision = false
      AND is_fixed = false  -- CRITICAL FIX: Exclude fixed transactions
      AND status = 'completed';  -- CRITICAL FIX: Only count completed transactions
      
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

-- ============================================================
-- COMMIT transaction
-- ============================================================
COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- Execute these to verify the migration was successful:
--
-- 1. Check trigger exists:
--    SELECT tgname FROM pg_trigger WHERE tgname = 'provision_deduction_trigger';
--
-- 2. Check function exists:
--    SELECT proname FROM pg_proc WHERE proname = 'handle_provision_deduction';
--
-- 3. Test provision behavior:
--    -- Create a provision and a fixed transaction
--    -- Verify the fixed transaction does NOT affect the provision amount
-- ============================================================
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.atomic_create_fixed_transaction IS 
'Cria transações fixas/recorrentes para 12 meses futuros.
IMPORTANTE para provisões:
- Ao calcular o valor inicial da provisão, desconta apenas transações NORMAIS (não fixas) e COMPLETED.
- Transações FIXAS nunca são descontadas do valor inicial da provisão.
- Transações PENDING nunca são descontadas do valor inicial da provisão.';
