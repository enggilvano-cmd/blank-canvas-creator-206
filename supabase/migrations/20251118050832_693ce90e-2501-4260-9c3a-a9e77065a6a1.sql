-- Corrigir função de limpeza de entries órfãos (versão simplificada)
CREATE OR REPLACE FUNCTION public.cleanup_orphan_journal_entries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count1 INTEGER;
  v_count2 INTEGER;
BEGIN
  -- Deletar journal entries que não têm transação correspondente
  WITH deleted AS (
    DELETE FROM public.journal_entries
    WHERE transaction_id IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE transactions.id = journal_entries.transaction_id
      )
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count1 FROM deleted;
  
  -- Deletar journal entries que não têm conta contábil válida
  WITH deleted AS (
    DELETE FROM public.journal_entries
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts 
      WHERE chart_of_accounts.id = journal_entries.account_id
    )
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count2 FROM deleted;
  
  RETURN v_count1 + v_count2;
END;
$$;