-- Fix: Provision deduction should ONLY happen for 'completed' transactions
-- Pending transactions should NOT be deducted from provisions until they are marked as completed

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
