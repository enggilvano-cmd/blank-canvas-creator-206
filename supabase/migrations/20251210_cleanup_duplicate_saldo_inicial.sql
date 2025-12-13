-- ============================================================
-- Migration: Cleanup Duplicate "Saldo Inicial" Transactions
-- Data: 2025-12-10
-- Descrição: Remove transações "Saldo Inicial" duplicadas mantendo apenas a mais antiga
-- ============================================================

BEGIN;

-- Criar função para limpar duplicatas de Saldo Inicial
CREATE OR REPLACE FUNCTION cleanup_duplicate_initial_balance()
RETURNS TABLE(
  account_id UUID,
  duplicates_removed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_record RECORD;
  v_duplicates_count INTEGER;
BEGIN
  -- Iterar por cada conta que tem múltiplas transações "Saldo Inicial"
  FOR v_account_record IN
    SELECT t.account_id, COUNT(*) as tx_count
    FROM transactions t
    WHERE t.description = 'Saldo Inicial'
    GROUP BY t.account_id
    HAVING COUNT(*) > 1
  LOOP
    -- Deletar todas exceto a mais antiga (menor created_at)
    WITH oldest_tx AS (
      SELECT id
      FROM transactions
      WHERE account_id = v_account_record.account_id
        AND description = 'Saldo Inicial'
      ORDER BY created_at ASC
      LIMIT 1
    )
    DELETE FROM transactions
    WHERE account_id = v_account_record.account_id
      AND description = 'Saldo Inicial'
      AND id NOT IN (SELECT id FROM oldest_tx);
    
    -- Contar quantos foram removidos
    GET DIAGNOSTICS v_duplicates_count = ROW_COUNT;
    
    -- Recalcular saldo da conta
    PERFORM recalculate_account_balance(v_account_record.account_id);
    
    -- Retornar resultado
    RETURN QUERY SELECT v_account_record.account_id, v_duplicates_count;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION cleanup_duplicate_initial_balance IS 
'Remove transações "Saldo Inicial" duplicadas, mantendo apenas a mais antiga por conta';

-- Executar a limpeza
DO $$
DECLARE
  v_result RECORD;
  v_total_removed INTEGER := 0;
BEGIN
  RAISE NOTICE 'Iniciando limpeza de transações "Saldo Inicial" duplicadas...';
  
  FOR v_result IN SELECT * FROM cleanup_duplicate_initial_balance()
  LOOP
    v_total_removed := v_total_removed + v_result.duplicates_removed;
    RAISE NOTICE 'Conta %: % duplicatas removidas', v_result.account_id, v_result.duplicates_removed;
  END LOOP;
  
  RAISE NOTICE 'Limpeza concluída. Total de duplicatas removidas: %', v_total_removed;
END;
$$;

-- Criar índice para melhorar performance de buscas por "Saldo Inicial"
CREATE INDEX IF NOT EXISTS idx_transactions_saldo_inicial 
ON transactions(account_id, description) 
WHERE description = 'Saldo Inicial';

COMMENT ON INDEX idx_transactions_saldo_inicial IS 
'Índice parcial para otimizar buscas por transações de Saldo Inicial';

COMMIT;
