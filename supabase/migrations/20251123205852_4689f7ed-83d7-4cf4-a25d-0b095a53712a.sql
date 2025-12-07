-- Primeiro, remover a função antiga
DROP FUNCTION IF EXISTS public.migrate_existing_transactions_to_journal();

-- Criar nova versão melhorada com tratamento de erro detalhado
CREATE OR REPLACE FUNCTION public.migrate_existing_transactions_to_journal()
RETURNS TABLE(processed_count integer, error_count integer, error_details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_error_details JSONB := '[]'::jsonb;
  v_transaction RECORD;
  v_asset_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
  v_error_msg TEXT;
BEGIN
  -- Processar todas as transações completed sem journal_entries
  FOR v_transaction IN 
    SELECT 
      t.id,
      t.user_id,
      t.description,
      t.amount,
      t.date,
      t.type,
      a.type as account_type
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
      v_asset_account_id := NULL;
      v_revenue_account_id := NULL;
      v_expense_account_id := NULL;
      v_error_msg := NULL;

      -- Mapear conta bancária para conta contábil (do mesmo usuário)
      IF v_transaction.account_type = 'checking' THEN
        SELECT id INTO v_asset_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND code = '1.01.02' 
          AND is_active = true
        LIMIT 1;
      ELSIF v_transaction.account_type = 'savings' THEN
        SELECT id INTO v_asset_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND code = '1.01.03' 
          AND is_active = true
        LIMIT 1;
      ELSIF v_transaction.account_type = 'investment' THEN
        SELECT id INTO v_asset_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND code = '1.01.04' 
          AND is_active = true
        LIMIT 1;
      ELSIF v_transaction.account_type = 'credit' THEN
        SELECT id INTO v_asset_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND code = '2.01.01' 
          AND is_active = true
        LIMIT 1;
      END IF;

      -- Fallback para qualquer conta de ativo do usuário
      IF v_asset_account_id IS NULL THEN
        SELECT id INTO v_asset_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND code LIKE '1.01.%' 
          AND is_active = true
        ORDER BY code 
        LIMIT 1;
      END IF;

      IF v_asset_account_id IS NULL THEN
        v_error_msg := 'No asset account found for user';
        RAISE EXCEPTION '%', v_error_msg;
      END IF;

      -- Criar lançamentos baseado no tipo
      IF v_transaction.type = 'income' THEN
        -- Buscar conta de receita do usuário
        SELECT id INTO v_revenue_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND category = 'revenue' 
          AND is_active = true
        ORDER BY code 
        LIMIT 1;

        IF v_revenue_account_id IS NULL THEN
          v_error_msg := 'No revenue account found for user';
          RAISE EXCEPTION '%', v_error_msg;
        END IF;

        -- Débito: Ativo | Crédito: Receita
        INSERT INTO journal_entries (
          user_id, transaction_id, account_id, entry_type, amount, description, entry_date
        ) VALUES 
          (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
          (v_transaction.user_id, v_transaction.id, v_revenue_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
        
        v_processed := v_processed + 1;

      ELSIF v_transaction.type = 'expense' THEN
        -- Buscar conta de despesa do usuário
        SELECT id INTO v_expense_account_id 
        FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id 
          AND category = 'expense' 
          AND is_active = true
        ORDER BY code 
        LIMIT 1;

        IF v_expense_account_id IS NULL THEN
          v_error_msg := 'No expense account found for user';
          RAISE EXCEPTION '%', v_error_msg;
        END IF;

        -- Débito: Despesa | Crédito: Ativo
        INSERT INTO journal_entries (
          user_id, transaction_id, account_id, entry_type, amount, description, entry_date
        ) VALUES 
          (v_transaction.user_id, v_transaction.id, v_expense_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
          (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
        
        v_processed := v_processed + 1;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        v_error_details := v_error_details || jsonb_build_object(
          'transaction_id', v_transaction.id,
          'description', v_transaction.description,
          'error', COALESCE(v_error_msg, SQLERRM)
        );
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors, v_error_details;
END;
$function$;