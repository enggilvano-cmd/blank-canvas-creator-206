-- Função para validar journal entries de um período
CREATE OR REPLACE FUNCTION public.validate_period_entries(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  is_valid BOOLEAN,
  unbalanced_count INTEGER,
  missing_entries_count INTEGER,
  total_transactions INTEGER,
  error_details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_transactions INTEGER := 0;
  v_unbalanced_count INTEGER := 0;
  v_missing_entries_count INTEGER := 0;
  v_error_details JSONB := '[]'::jsonb;
  v_transaction RECORD;
BEGIN
  -- Contar total de transações completed no período
  SELECT COUNT(*)
  INTO v_total_transactions
  FROM transactions
  WHERE user_id = p_user_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'completed'
    AND type IN ('income', 'expense');

  -- Verificar cada transação
  FOR v_transaction IN 
    SELECT 
      t.id,
      t.description,
      t.date,
      t.type,
      t.amount
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date >= p_start_date
      AND t.date <= p_end_date
      AND t.status = 'completed'
      AND t.type IN ('income', 'expense')
  LOOP
    -- Verificar se tem journal entries
    DECLARE
      v_has_entries BOOLEAN;
      v_is_balanced BOOLEAN;
      v_debit_total NUMERIC;
      v_credit_total NUMERIC;
    BEGIN
      -- Verificar existência de journal entries
      SELECT EXISTS(
        SELECT 1 FROM journal_entries 
        WHERE transaction_id = v_transaction.id
      ) INTO v_has_entries;

      IF NOT v_has_entries THEN
        -- Transação sem journal entries
        v_missing_entries_count := v_missing_entries_count + 1;
        v_error_details := v_error_details || jsonb_build_object(
          'transaction_id', v_transaction.id,
          'description', v_transaction.description,
          'date', v_transaction.date,
          'type', v_transaction.type,
          'error', 'Missing journal entries'
        );
      ELSE
        -- Verificar balanceamento
        SELECT 
          COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
        INTO v_debit_total, v_credit_total
        FROM journal_entries
        WHERE transaction_id = v_transaction.id;

        v_is_balanced := ABS(v_debit_total - v_credit_total) < 0.01;

        IF NOT v_is_balanced THEN
          -- Journal entries não balanceadas
          v_unbalanced_count := v_unbalanced_count + 1;
          v_error_details := v_error_details || jsonb_build_object(
            'transaction_id', v_transaction.id,
            'description', v_transaction.description,
            'date', v_transaction.date,
            'type', v_transaction.type,
            'error', 'Unbalanced entries',
            'debits', v_debit_total,
            'credits', v_credit_total,
            'difference', v_debit_total - v_credit_total
          );
        END IF;
      END IF;
    END;
  END LOOP;

  -- Retornar resultado
  RETURN QUERY SELECT
    (v_unbalanced_count = 0 AND v_missing_entries_count = 0) AS is_valid,
    v_unbalanced_count,
    v_missing_entries_count,
    v_total_transactions,
    v_error_details;
END;
$$;

-- Adicionar comentário
COMMENT ON FUNCTION public.validate_period_entries IS 'Valida se todas as journal entries de um período estão balanceadas (débitos = créditos) antes de permitir fechamento contábil';
