-- CORREÇÃO: Garantir que TODAS as filhas pendentes sejam deletadas ao excluir transação fixa
-- O problema era que a query de DELETE não estava funcionando corretamente

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
  v_temp_count INTEGER := 0;
  v_linked_deleted INTEGER := 0;
  v_transaction_user_id UUID;
  v_transaction_date DATE;
  v_transaction_status TEXT;
  v_parent_id UUID;
  v_real_parent_id UUID;
  v_account_id UUID;
  v_affected_accounts UUID[];
  v_acc UUID;
  v_linked_transaction_id UUID;
  v_to_account_id UUID;
  v_reverse_linked_id UUID;
  v_is_fixed BOOLEAN;
  v_is_recurring BOOLEAN;
  v_completed_children_count INTEGER := 0;
  v_pending_children_count INTEGER := 0;
  v_remaining_children_count INTEGER := 0;
  v_parent_is_fixed BOOLEAN;
BEGIN
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- Buscar dados da transação alvo
  SELECT user_id, date, parent_transaction_id, account_id, 
         linked_transaction_id, to_account_id, status, is_fixed, is_recurring
  INTO v_transaction_user_id, v_transaction_date, v_real_parent_id, v_account_id, 
       v_linked_transaction_id, v_to_account_id, v_transaction_status, v_is_fixed, v_is_recurring
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_transaction_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  IF v_transaction_user_id != p_user_id THEN
    RETURN QUERY SELECT false, 0, 'Transaction does not belong to user'::TEXT;
    RETURN;
  END IF;

  -- Determinar o ID do parent real
  v_parent_id := COALESCE(v_real_parent_id, p_transaction_id);

  -- Contar filhas por status
  SELECT COUNT(*) INTO v_completed_children_count
  FROM transactions 
  WHERE parent_transaction_id = v_parent_id 
    AND status = 'completed'
    AND user_id = p_user_id;
    
  SELECT COUNT(*) INTO v_pending_children_count
  FROM transactions 
  WHERE parent_transaction_id = v_parent_id 
    AND status = 'pending'
    AND user_id = p_user_id;

  -- Log para debug
  RAISE NOTICE 'atomic_delete_transaction: parent_id=%, completed=%, pending=%', v_parent_id, v_completed_children_count, v_pending_children_count;

  IF p_scope = 'current' THEN
    -- ========== SCOPE: CURRENT ==========
    IF v_linked_transaction_id IS NOT NULL THEN
      v_reverse_linked_id := v_linked_transaction_id;
    ELSIF v_to_account_id IS NOT NULL THEN
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      LIMIT 1;
    END IF;
    
    DELETE FROM transactions 
    WHERE id = p_transaction_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    IF v_reverse_linked_id IS NOT NULL THEN
      DELETE FROM transactions
      WHERE id = v_reverse_linked_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_linked_deleted = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_linked_deleted;
    END IF;
    
    PERFORM recalculate_account_balance(v_account_id);
    
    IF v_to_account_id IS NOT NULL THEN
      PERFORM recalculate_account_balance(v_to_account_id);
    END IF;
    
    -- Limpeza de pai órfã
    IF v_real_parent_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_remaining_children_count
      FROM transactions
      WHERE parent_transaction_id = v_real_parent_id AND user_id = p_user_id;
      
      SELECT is_fixed INTO v_parent_is_fixed
      FROM transactions
      WHERE id = v_real_parent_id AND user_id = p_user_id;
      
      IF v_remaining_children_count = 0 AND (v_parent_is_fixed = false OR v_parent_is_fixed IS NULL) THEN
        DELETE FROM transactions
        WHERE id = v_real_parent_id AND user_id = p_user_id;
        v_deleted_count := v_deleted_count + 1;
      END IF;
    END IF;
    
  ELSIF p_scope = 'current-and-remaining' THEN
    -- ========== SCOPE: CURRENT-AND-REMAINING ==========
    SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
    FROM transactions
    WHERE user_id = p_user_id 
      AND (id = v_parent_id OR parent_transaction_id = v_parent_id)
      AND date >= v_transaction_date
      AND status = 'pending';
    
    DELETE FROM transactions 
    WHERE user_id = p_user_id 
      AND parent_transaction_id = v_parent_id
      AND date >= v_transaction_date
      AND status = 'pending';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    DELETE FROM transactions 
    WHERE id = v_parent_id 
      AND user_id = p_user_id
      AND status = 'pending'
      AND date >= v_transaction_date;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
    
    IF v_affected_accounts IS NOT NULL THEN
      FOREACH v_acc IN ARRAY v_affected_accounts LOOP
        IF v_acc IS NOT NULL THEN
          PERFORM recalculate_account_balance(v_acc);
        END IF;
      END LOOP;
    END IF;
    
  ELSIF p_scope = 'all' THEN
    -- ========== SCOPE: ALL ==========
    
    -- Coletar contas afetadas ANTES de qualquer operação
    SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
    FROM transactions
    WHERE user_id = p_user_id 
      AND (id = v_parent_id OR parent_transaction_id = v_parent_id);
    
    IF v_completed_children_count > 0 THEN
      -- TEM FILHAS CONCLUÍDAS: Preservar concluídas, deletar pendentes
      
      RAISE NOTICE 'Deleting % pending children for parent %', v_pending_children_count, v_parent_id;
      
      -- 1. Deletar TODAS as filhas PENDENTES
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id
        AND status = 'pending';
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      RAISE NOTICE 'Deleted % pending children', v_deleted_count;
      
      -- 2. Soft delete na transação PAI (remove da página Planejamento)
      UPDATE transactions
      SET is_fixed = false
      WHERE id = v_parent_id AND user_id = p_user_id;
      
      -- 3. Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, format('Deleted %s pending, preserved %s completed', v_deleted_count, v_completed_children_count)::TEXT;
      RETURN;
      
    ELSE
      -- NÃO TEM FILHAS CONCLUÍDAS: Deletar tudo
      
      -- 1. Deletar todas as filhas
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- 2. Deletar a transação pai
      DELETE FROM transactions 
      WHERE id = v_parent_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
      
      -- 3. Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_deleted_count, 'Deleted successfully'::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'atomic_delete_transaction failed: %', SQLERRM USING ERRCODE = 'PGRST500';
END;
$$;
