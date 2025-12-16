-- Trigger function to handle transfer deletions
CREATE OR REPLACE FUNCTION public.handle_transfer_delete()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  IF OLD.linked_transaction_id IS NOT NULL THEN
    DELETE FROM public.transactions WHERE id = OLD.linked_transaction_id;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  -- We need to find and delete them.
  DELETE FROM public.transactions WHERE linked_transaction_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to handle transfer updates
CREATE OR REPLACE FUNCTION public.handle_transfer_update()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Check if relevant fields changed
  IF NEW.amount = OLD.amount AND NEW.date = OLD.date THEN
    RETURN NEW;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  -- Incoming is positive, Outgoing is negative.
  IF NEW.linked_transaction_id IS NOT NULL THEN
    UPDATE public.transactions
    SET 
      amount = -ABS(NEW.amount), -- Ensure outgoing is negative
      date = NEW.date
    WHERE id = NEW.linked_transaction_id;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  -- Outgoing is negative, Incoming is positive.
  -- We update the Incoming transaction that points to this Outgoing one.
  UPDATE public.transactions
  SET 
    amount = ABS(NEW.amount), -- Ensure incoming is positive
    date = NEW.date
  WHERE linked_transaction_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Triggers
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
