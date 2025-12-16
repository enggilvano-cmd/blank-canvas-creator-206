-- Fix transfer triggers to ensure account balances are recalculated
-- This addresses the issue where editing/deleting a transfer didn't update the account balances

CREATE OR REPLACE FUNCTION public.handle_transfer_delete()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked_txn RECORD;
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  IF OLD.linked_transaction_id IS NOT NULL THEN
    -- Get linked transaction details
    SELECT * INTO v_linked_txn FROM public.transactions WHERE id = OLD.linked_transaction_id;
    
    IF FOUND THEN
      -- Delete linked transaction
      DELETE FROM public.transactions WHERE id = OLD.linked_transaction_id;
      
      -- Recalculate balance for linked account
      PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
    END IF;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  FOR v_linked_txn IN 
    SELECT * FROM public.transactions WHERE linked_transaction_id = OLD.id
  LOOP
    -- Delete linked transaction
    DELETE FROM public.transactions WHERE id = v_linked_txn.id;
    
    -- Recalculate balance for linked account
    PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
  END LOOP;

  -- Finally, recalculate for the current account
  PERFORM public.recalculate_account_balance(OLD.account_id);

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_transfer_update()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked_txn RECORD;
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Check if relevant fields changed
  IF NEW.amount = OLD.amount AND NEW.date = OLD.date AND NEW.account_id = OLD.account_id THEN
    RETURN NEW;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  IF NEW.linked_transaction_id IS NOT NULL THEN
    SELECT * INTO v_linked_txn FROM public.transactions WHERE id = NEW.linked_transaction_id;
    
    IF FOUND THEN
      UPDATE public.transactions
      SET 
        amount = -ABS(NEW.amount), -- Ensure outgoing is negative
        date = NEW.date
      WHERE id = NEW.linked_transaction_id;
      
      -- Recalculate linked account
      PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
    END IF;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  FOR v_linked_txn IN 
    SELECT * FROM public.transactions WHERE linked_transaction_id = NEW.id
  LOOP
    UPDATE public.transactions
    SET 
      amount = ABS(NEW.amount), -- Ensure incoming is positive
      date = NEW.date
    WHERE id = v_linked_txn.id;
    
    -- Recalculate linked account
    PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
  END LOOP;

  -- Recalculate for current account
  PERFORM public.recalculate_account_balance(NEW.account_id);
  
  -- If account changed (unlikely for transfers but possible), recalc old account too
  IF OLD.account_id != NEW.account_id THEN
    PERFORM public.recalculate_account_balance(OLD.account_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply triggers (just to be safe, though replacing function is enough if trigger already points to it)
DROP TRIGGER IF EXISTS trigger_handle_transfer_delete ON public.transactions;
CREATE TRIGGER trigger_handle_transfer_delete
AFTER DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_transfer_delete();

DROP TRIGGER IF EXISTS trigger_handle_transfer_update ON public.transactions;
CREATE TRIGGER trigger_handle_transfer_update
AFTER UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_transfer_update();
