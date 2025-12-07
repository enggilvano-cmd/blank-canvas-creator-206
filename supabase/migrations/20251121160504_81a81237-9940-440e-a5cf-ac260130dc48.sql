-- Criar função para migrar transações existentes para journal_entries
CREATE OR REPLACE FUNCTION migrate_existing_transactions_to_journal()
RETURNS TABLE(processed_count INTEGER, error_count INTEGER) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_transaction RECORD;
  v_account RECORD;
  v_category RECORD;
  v_coa RECORD;
  v_asset_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
BEGIN
  -- Processar todas as transações completed sem journal_entries
  FOR v_transaction IN 
    SELECT t.*, a.type as account_type
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.status = 'completed'
      AND t.type IN ('income', 'expense')
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.transaction_id = t.id
      )
  LOOP
    BEGIN
      -- Buscar plano de contas do usuário
      SELECT * INTO v_coa 
      FROM chart_of_accounts 
      WHERE user_id = v_transaction.user_id 
      LIMIT 1;
      
      IF v_coa.id IS NULL THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Mapear conta bancária para conta contábil
      IF v_transaction.account_type = 'checking' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.02' LIMIT 1;
      ELSIF v_transaction.account_type = 'savings' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.03' LIMIT 1;
      ELSIF v_transaction.account_type = 'investment' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.04' LIMIT 1;
      ELSIF v_transaction.account_type = 'credit' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '2.01.01' LIMIT 1;
      END IF;

      -- Fallback
      IF v_asset_account_id IS NULL THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code LIKE '1.01.%' 
        ORDER BY code LIMIT 1;
      END IF;

      IF v_asset_account_id IS NULL THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      IF v_transaction.type = 'income' THEN
        -- Buscar conta de receita
        SELECT id INTO v_revenue_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND category = 'revenue' 
        ORDER BY code LIMIT 1;

        IF v_revenue_account_id IS NOT NULL THEN
          -- Débito: Ativo | Crédito: Receita
          INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
          VALUES 
            (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
            (v_transaction.user_id, v_transaction.id, v_revenue_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
          
          v_processed := v_processed + 1;
        ELSE
          v_errors := v_errors + 1;
        END IF;

      ELSIF v_transaction.type = 'expense' THEN
        -- Buscar conta de despesa
        SELECT id INTO v_expense_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND category = 'expense' 
        ORDER BY code LIMIT 1;

        IF v_expense_account_id IS NOT NULL THEN
          -- Débito: Despesa | Crédito: Ativo
          INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
          VALUES 
            (v_transaction.user_id, v_transaction.id, v_expense_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
            (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
          
          v_processed := v_processed + 1;
        ELSE
          v_errors := v_errors + 1;
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;