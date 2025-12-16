CREATE OR REPLACE FUNCTION public.atomic_delete_transaction(
  p_user_id UUID,
  p_transaction_id UUID,
  p_scope TEXT DEFAULT 'current'
)
RETURNS TABLE (
  success BOOLEAN,
  deleted_count INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_transaction_user_id UUID;
  v_transaction_date DATE;
  v_parent_id UUID;
BEGIN
  -- 🔐 SECURITY: VALIDAR USER_ID PRIMEIRO
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- Validar que transaction_id existe e pertence ao user
  SELECT user_id, date, COALESCE(parent_transaction_id, id)
  INTO v_transaction_user_id, v_transaction_date, v_parent_id
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_transaction_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- 🔐 VALIDAÇÃO DUPLA: Confirmar propriedade
  IF v_transaction_user_id != p_user_id THEN
    RETURN QUERY SELECT false, 0, 'Transaction does not belong to user'::TEXT;
    RETURN;
  END IF;

  -- Deletar baseado no scope
  IF p_scope = 'current' THEN
    -- Deletar apenas a transação especificada
    DELETE FROM transactions 
    WHERE id = p_transaction_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
  ELSIF p_scope = 'current-and-remaining' THEN
    -- Deletar transação atual e todas as futuras da série
    DELETE FROM transactions 
    WHERE user_id = p_user_id 
      AND (
        (id = v_parent_id OR parent_transaction_id = v_parent_id)
        AND date >= v_transaction_date
      );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
  ELSIF p_scope = 'all' THEN
    -- Deletar transação e TODA a série recorrente
    DELETE FROM transactions 
    WHERE user_id = p_user_id 
      AND (id = v_parent_id OR parent_transaction_id = v_parent_id);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  ELSE
    RETURN QUERY SELECT false, 0, 'Invalid scope'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_deleted_count, 'Transactions deleted successfully'::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'atomic_delete_transaction failed: %', SQLERRM USING ERRCODE = 'PGRST500';
END;
$$;
