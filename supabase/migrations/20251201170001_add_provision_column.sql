
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
