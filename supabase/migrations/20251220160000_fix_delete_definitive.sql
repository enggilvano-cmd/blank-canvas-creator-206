-- CORREÇÃO DEFINITIVA: Resolver bugs ao excluir transações fixas
-- Problemas identificados:
-- 1. Última filha pendente estava sendo preservada incorretamente
-- 2. Transação "fantasma" aparecia na página Planejamento após excluir filhas

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
  -- Se a transação tem parent_transaction_id, usa ele; senão, ela mesma é o parent
  v_parent_id := COALESCE(v_real_parent_id, p_transaction_id);

  -- Contar filhas concluídas
  SELECT COUNT(*) INTO v_completed_children_count
  FROM transactions 
  WHERE parent_transaction_id = v_parent_id 
    AND status = 'completed'
    AND user_id = p_user_id;

  IF p_scope = 'current' THEN
    -- ========== SCOPE: CURRENT ==========
    -- Deletar apenas a transação específica
    
    IF v_linked_transaction_id IS NOT NULL THEN
      v_reverse_linked_id := v_linked_transaction_id;
    ELSIF v_to_account_id IS NOT NULL THEN
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      LIMIT 1;
    END IF;
    
    -- Deletar a transação principal
    DELETE FROM transactions 
    WHERE id = p_transaction_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Deletar a transação vinculada se existir
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
    
    -- Verificar se a pai ficou órfã (sem filhas e is_fixed = false)
    IF v_real_parent_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_remaining_children_count
      FROM transactions
      WHERE parent_transaction_id = v_real_parent_id AND user_id = p_user_id;
      
      SELECT is_fixed INTO v_parent_is_fixed
      FROM transactions
      WHERE id = v_real_parent_id AND user_id = p_user_id;
      
      -- Se não tem mais filhas E pai não é mais "fixa", deletar a pai
      IF v_remaining_children_count = 0 AND (v_parent_is_fixed = false OR v_parent_is_fixed IS NULL) THEN
        DELETE FROM transactions
        WHERE id = v_real_parent_id AND user_id = p_user_id;
        v_deleted_count := v_deleted_count + 1;
      END IF;
    END IF;
    
  ELSIF p_scope = 'current-and-remaining' THEN
    -- ========== SCOPE: CURRENT-AND-REMAINING ==========
    -- Deletar transações PENDENTES com data >= data atual
    
    -- Coletar contas afetadas ANTES de deletar
    SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
    FROM transactions
    WHERE user_id = p_user_id 
      AND (id = v_parent_id OR parent_transaction_id = v_parent_id)
      AND date >= v_transaction_date
      AND status = 'pending';
    
    -- Deletar filhas pendentes com data >= atual
    DELETE FROM transactions 
    WHERE user_id = p_user_id 
      AND parent_transaction_id = v_parent_id
      AND date >= v_transaction_date
      AND status = 'pending';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Se a transação alvo é o pai e está pendente, deletar também
    DELETE FROM transactions 
    WHERE id = v_parent_id 
      AND user_id = p_user_id
      AND status = 'pending'
      AND date >= v_transaction_date;
    v_deleted_count := v_deleted_count + 1;
    
    -- Recalcular saldos
    IF v_affected_accounts IS NOT NULL THEN
      FOREACH v_acc IN ARRAY v_affected_accounts LOOP
        IF v_acc IS NOT NULL THEN
          PERFORM recalculate_account_balance(v_acc);
        END IF;
      END LOOP;
    END IF;
    
  ELSIF p_scope = 'all' THEN
    -- ========== SCOPE: ALL ==========
    
    IF v_completed_children_count > 0 THEN
      -- TEM FILHAS CONCLUÍDAS: Preservar concluídas, deletar pendentes
      
      -- 1. Coletar contas afetadas ANTES de deletar
      SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
      FROM transactions
      WHERE user_id = p_user_id 
        AND (id = v_parent_id OR parent_transaction_id = v_parent_id)
        AND status = 'pending';
      
      -- 2. Soft delete na transação PAI (apenas remove da página Planejamento)
      UPDATE transactions
      SET is_fixed = false
      WHERE id = v_parent_id AND user_id = p_user_id;
      
      -- 3. Deletar TODAS as filhas PENDENTES (não apenas as da query com CTE)
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id
        AND status = 'pending';
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- 4. Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, 'Deleted pending transactions, completed ones preserved with Fixed badge'::TEXT;
      RETURN;
      
    ELSE
      -- NÃO TEM FILHAS CONCLUÍDAS: Deletar tudo (pai + todas as filhas pendentes)
      
      -- 1. Coletar contas afetadas ANTES de deletar
      SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
      FROM transactions
      WHERE user_id = p_user_id 
        AND (id = v_parent_id OR parent_transaction_id = v_parent_id);
      
      -- 2. Deletar todas as filhas primeiro
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- 3. Deletar a transação pai
      DELETE FROM transactions 
      WHERE id = v_parent_id AND user_id = p_user_id;
      v_deleted_count := v_deleted_count + 1;
      
      -- 4. Recalcular saldos
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
