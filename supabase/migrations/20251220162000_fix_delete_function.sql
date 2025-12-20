-- CORREÇÃO SIMPLIFICADA: Garantir exclusão de TODAS as pendentes ao excluir transação fixa
-- Problema identificado: A lógica estava muito complexa e pode haver condições de corrida

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
  v_transaction_user_id UUID;
  v_transaction_date DATE;
  v_parent_id UUID;
  v_real_parent_id UUID;
  v_account_id UUID;
  v_affected_accounts UUID[];
  v_acc UUID;
  v_linked_transaction_id UUID;
  v_to_account_id UUID;
  v_reverse_linked_id UUID;
  v_is_fixed BOOLEAN;
  v_transaction_status TEXT;
  v_completed_children_count INTEGER := 0;
  v_pending_children_count INTEGER := 0;
  v_remaining_children_count INTEGER := 0;
  v_parent_is_fixed BOOLEAN;
BEGIN
  -- Validar acesso do usuário
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- Buscar dados da transação
  SELECT user_id, date, parent_transaction_id, account_id, 
         linked_transaction_id, to_account_id, status, is_fixed
  INTO v_transaction_user_id, v_transaction_date, v_real_parent_id, v_account_id, 
       v_linked_transaction_id, v_to_account_id, v_transaction_status, v_is_fixed
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

  -- =====================================
  -- SCOPE: CURRENT - Deletar apenas a transação especificada
  -- =====================================
  IF p_scope = 'current' THEN
    -- Handle linked transfers
    IF v_linked_transaction_id IS NOT NULL THEN
      v_reverse_linked_id := v_linked_transaction_id;
    ELSIF v_to_account_id IS NOT NULL THEN
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      LIMIT 1;
    END IF;
    
    -- Deletar transação
    DELETE FROM transactions 
    WHERE id = p_transaction_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Deletar linked transaction se existir
    IF v_reverse_linked_id IS NOT NULL THEN
      DELETE FROM transactions
      WHERE id = v_reverse_linked_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
    END IF;
    
    PERFORM recalculate_account_balance(v_account_id);
    IF v_to_account_id IS NOT NULL THEN
      PERFORM recalculate_account_balance(v_to_account_id);
    END IF;
    
    -- Limpeza de pai órfão
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
    
    RETURN QUERY SELECT true, v_deleted_count, 'Transaction deleted'::TEXT;
    RETURN;
  END IF;

  -- =====================================
  -- Para scopes 'all' e 'current-and-remaining', determinar o parent
  -- =====================================
  
  -- Se a transação tem um parent, usar o parent. Senão, a própria transação é o parent.
  v_parent_id := COALESCE(v_real_parent_id, p_transaction_id);

  -- Coletar contas afetadas
  SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
  FROM transactions
  WHERE user_id = p_user_id 
    AND (id = v_parent_id OR parent_transaction_id = v_parent_id);

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

  -- =====================================
  -- SCOPE: CURRENT-AND-REMAINING
  -- =====================================
  IF p_scope = 'current-and-remaining' THEN
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
    
    RETURN QUERY SELECT true, v_deleted_count, format('Deleted %s pending from date', v_deleted_count)::TEXT;
    RETURN;
  END IF;

  -- =====================================
  -- SCOPE: ALL - Deletar TUDO ou preservar concluídas
  -- =====================================
  IF p_scope = 'all' THEN
    IF v_completed_children_count > 0 THEN
      -- TEM FILHAS CONCLUÍDAS: Preservar concluídas, deletar pendentes
      
      -- PASSO 1: Deletar TODAS as filhas PENDENTES explicitamente
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id
        AND status = 'pending';
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- PASSO 2: "Soft delete" no pai - apenas marca is_fixed = false
      -- Isso remove da página Planejamento mas não apaga
      UPDATE transactions
      SET is_fixed = false
      WHERE id = v_parent_id 
        AND user_id = p_user_id;
      
      -- PASSO 3: Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, 
        format('Deleted %s pending children, preserved %s completed, parent soft-deleted', 
               v_deleted_count, v_completed_children_count)::TEXT;
      RETURN;
      
    ELSE
      -- NÃO TEM FILHAS CONCLUÍDAS: Deletar tudo normalmente
      
      -- PASSO 1: Deletar todas as filhas
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- PASSO 2: Deletar o pai
      DELETE FROM transactions 
      WHERE id = v_parent_id 
        AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
      
      -- PASSO 3: Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, format('Deleted all %s transactions', v_deleted_count)::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Scope inválido
  RETURN QUERY SELECT false, 0, format('Invalid scope: %s', p_scope)::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;
