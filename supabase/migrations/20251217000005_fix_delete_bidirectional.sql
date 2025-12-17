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
  v_linked_deleted INTEGER := 0;
  v_transaction_user_id UUID;
  v_transaction_date DATE;
  v_parent_id UUID;
  v_account_id UUID;
  v_affected_accounts UUID[];
  v_acc UUID;
  v_linked_transaction_id UUID;
  v_to_account_id UUID;
  v_reverse_linked_id UUID;
BEGIN
  -- 🔐 SECURITY: VALIDAR USER_ID PRIMEIRO
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- Validar que transaction_id existe e pertence ao user
  -- Também buscar linked_transaction_id e to_account_id para transferências
  SELECT user_id, date, COALESCE(parent_transaction_id, id), account_id, linked_transaction_id, to_account_id
  INTO v_transaction_user_id, v_transaction_date, v_parent_id, v_account_id, v_linked_transaction_id, v_to_account_id
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
    
    -- BUSCAR TRANSAÇÃO VINCULADA EM AMBAS AS DIREÇÕES:
    -- 1. Se esta transação tem linked_transaction_id (é a transação de ENTRADA), deletar a de SAÍDA
    IF v_linked_transaction_id IS NOT NULL THEN
      DELETE FROM transactions
      WHERE id = v_linked_transaction_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_linked_deleted = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_linked_deleted;
    -- 2. Se esta transação tem to_account_id (é a transação de SAÍDA), buscar a de ENTRADA que aponta para ela
    ELSIF v_to_account_id IS NOT NULL THEN
      -- Buscar a transação que tem linked_transaction_id = p_transaction_id
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      LIMIT 1;
      
      IF v_reverse_linked_id IS NOT NULL THEN
        DELETE FROM transactions
        WHERE id = v_reverse_linked_id AND user_id = p_user_id;
        GET DIAGNOSTICS v_linked_deleted = ROW_COUNT;
        v_deleted_count := v_deleted_count + v_linked_deleted;
      END IF;
    END IF;
    
    -- Recalcular saldo da conta origem
    PERFORM recalculate_account_balance(v_account_id);
    
    -- Se for transferência, recalcular também a conta destino
    IF v_to_account_id IS NOT NULL THEN
      PERFORM recalculate_account_balance(v_to_account_id);
    END IF;
    
  ELSIF p_scope = 'current-and-remaining' THEN
    -- Buscar todas as transações da série que serão deletadas para pegar os linked_transaction_ids
    WITH transactions_to_delete AS (
      SELECT id, linked_transaction_id, to_account_id, account_id
      FROM transactions
      WHERE user_id = p_user_id 
        AND (
          (id = v_parent_id OR parent_transaction_id = v_parent_id)
          AND date >= v_transaction_date
        )
    ),
    -- Deletar transação atual e todas as futuras da série
    deleted AS (
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND id IN (SELECT id FROM transactions_to_delete)
      RETURNING account_id, to_account_id
    ),
    -- Deletar também as transações vinculadas (para transferências)
    -- Buscar em ambas direções: linked_transaction_id direto E reverso
    deleted_linked AS (
      DELETE FROM transactions
      WHERE user_id = p_user_id
        AND (
          id IN (SELECT linked_transaction_id FROM transactions_to_delete WHERE linked_transaction_id IS NOT NULL)
          OR linked_transaction_id IN (SELECT id FROM transactions_to_delete WHERE to_account_id IS NOT NULL)
        )
      RETURNING account_id
    ),
    -- Coletar todas as contas afetadas
    all_affected AS (
      SELECT account_id FROM deleted WHERE account_id IS NOT NULL
      UNION
      SELECT to_account_id FROM deleted WHERE to_account_id IS NOT NULL
      UNION
      SELECT account_id FROM deleted_linked WHERE account_id IS NOT NULL
    )
    SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts FROM all_affected WHERE account_id IS NOT NULL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Recalcular saldo para todas as contas afetadas
    IF v_affected_accounts IS NOT NULL THEN
      FOREACH v_acc IN ARRAY v_affected_accounts LOOP
        PERFORM recalculate_account_balance(v_acc);
      END LOOP;
    END IF;
    
  ELSIF p_scope = 'all' THEN
    -- Buscar todas as transações da série que serão deletadas para pegar os linked_transaction_ids
    WITH transactions_to_delete AS (
      SELECT id, linked_transaction_id, to_account_id, account_id
      FROM transactions
      WHERE user_id = p_user_id 
        AND (id = v_parent_id OR parent_transaction_id = v_parent_id)
    ),
    -- Deletar transação e TODA a série recorrente
    deleted AS (
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND id IN (SELECT id FROM transactions_to_delete)
      RETURNING account_id, to_account_id
    ),
    -- Deletar também as transações vinculadas (para transferências)
    -- Buscar em ambas direções: linked_transaction_id direto E reverso
    deleted_linked AS (
      DELETE FROM transactions
      WHERE user_id = p_user_id
        AND (
          id IN (SELECT linked_transaction_id FROM transactions_to_delete WHERE linked_transaction_id IS NOT NULL)
          OR linked_transaction_id IN (SELECT id FROM transactions_to_delete WHERE to_account_id IS NOT NULL)
        )
      RETURNING account_id
    ),
    -- Coletar todas as contas afetadas
    all_affected AS (
      SELECT account_id FROM deleted WHERE account_id IS NOT NULL
      UNION
      SELECT to_account_id FROM deleted WHERE to_account_id IS NOT NULL
      UNION
      SELECT account_id FROM deleted_linked WHERE account_id IS NOT NULL
    )
    SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts FROM all_affected WHERE account_id IS NOT NULL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Recalcular saldo para todas as contas afetadas
    IF v_affected_accounts IS NOT NULL THEN
      FOREACH v_acc IN ARRAY v_affected_accounts LOOP
        PERFORM recalculate_account_balance(v_acc);
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_deleted_count, 'Deleted successfully'::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'atomic_delete_transaction failed: %', SQLERRM USING ERRCODE = 'PGRST500';
END;
$$;
