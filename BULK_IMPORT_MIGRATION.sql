-- Função para criar múltiplas transações em batch
CREATE OR REPLACE FUNCTION bulk_create_transactions(
  p_user_id UUID,
  p_transactions JSONB
)
RETURNS TABLE (
  idx INT,
  success BOOLEAN,
  transaction_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx JSONB;
  tx_record RECORD;
  v_transaction_id UUID;
  v_account_type TEXT;
  v_balance_change BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- Iterar sobre cada transação no array
  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    BEGIN
      -- Extrair dados da transação
      SELECT 
        (tx->>'idx')::INT,
        tx->>'description',
        (tx->>'amount')::BIGINT,
        (tx->>'date')::DATE,
        tx->>'type',
        NULLIF(tx->>'category_id', '')::UUID,
        (tx->>'account_id')::UUID,
        tx->>'status',
        NULLIF(tx->>'invoice_month', ''),
        (tx->>'installments')::INT,
        (tx->>'current_installment')::INT
      INTO tx_record.idx, tx_record.description, tx_record.amount, tx_record.date,
           tx_record.type, tx_record.category_id, tx_record.account_id, tx_record.status,
           tx_record.invoice_month, tx_record.installments, tx_record.current_installment;

      -- Obter tipo da conta
      SELECT type INTO v_account_type
      FROM accounts
      WHERE id = tx_record.account_id AND user_id = p_user_id;

      IF v_account_type IS NULL THEN
        idx := tx_record.idx;
        success := FALSE;
        transaction_id := NULL;
        error_message := 'Account not found';
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- Calcular mudança de saldo
      IF tx_record.type = 'income' THEN
        v_balance_change := tx_record.amount;
      ELSE
        v_balance_change := -tx_record.amount;
      END IF;

      -- Inserir transação
      INSERT INTO transactions (
        user_id, description, amount, date, type, category_id, account_id, 
        status, invoice_month, invoice_month_overridden, installments, current_installment
      )
      VALUES (
        p_user_id, tx_record.description, 
        CASE WHEN tx_record.type = 'income' THEN tx_record.amount ELSE -tx_record.amount END,
        tx_record.date, tx_record.type, tx_record.category_id, tx_record.account_id,
        tx_record.status, tx_record.invoice_month, tx_record.invoice_month IS NOT NULL,
        tx_record.installments, tx_record.current_installment
      )
      RETURNING id INTO v_transaction_id;

      -- Atualizar saldo se transação completada e conta não é crédito
      IF tx_record.status = 'completed' AND v_account_type != 'credit' THEN
        UPDATE accounts
        SET balance = balance + v_balance_change
        WHERE id = tx_record.account_id AND user_id = p_user_id
        RETURNING balance INTO v_new_balance;
      END IF;

      idx := tx_record.idx;
      success := TRUE;
      transaction_id := v_transaction_id;
      error_message := NULL;
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      idx := (tx->>'idx')::INT;
      success := FALSE;
      transaction_id := NULL;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- Função para criar múltiplas transferências em batch
CREATE OR REPLACE FUNCTION bulk_create_transfers(
  p_user_id UUID,
  p_transfers JSONB
)
RETURNS TABLE (
  idx INT,
  success BOOLEAN,
  outgoing_id UUID,
  incoming_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tf JSONB;
  tf_record RECORD;
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_account_type TEXT;
  v_to_account_type TEXT;
  v_transfer_category_id UUID;
BEGIN
  -- Buscar categoria de transferência (criar se não existir)
  SELECT id INTO v_transfer_category_id
  FROM categories
  WHERE user_id = p_user_id AND name = 'Transferência'
  LIMIT 1;

  IF v_transfer_category_id IS NULL THEN
    INSERT INTO categories (user_id, name, type)
    VALUES (p_user_id, 'Transferência', 'both')
    RETURNING id INTO v_transfer_category_id;
  END IF;

  -- Iterar sobre cada transferência
  FOR tf IN SELECT * FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      -- Extrair dados
      SELECT 
        (tf->>'idx')::INT,
        (tf->>'from_account_id')::UUID,
        (tf->>'to_account_id')::UUID,
        (tf->>'amount')::BIGINT,
        (tf->>'date')::DATE,
        COALESCE(tf->>'outgoing_description', 'Transferência enviada'),
        COALESCE(tf->>'incoming_description', 'Transferência recebida'),
        tf->>'status'
      INTO tf_record.idx, tf_record.from_account_id, tf_record.to_account_id,
           tf_record.amount, tf_record.date, tf_record.outgoing_description,
           tf_record.incoming_description, tf_record.status;

      -- Verificar contas
      SELECT type INTO v_from_account_type
      FROM accounts WHERE id = tf_record.from_account_id AND user_id = p_user_id;

      SELECT type INTO v_to_account_type
      FROM accounts WHERE id = tf_record.to_account_id AND user_id = p_user_id;

      IF v_from_account_type IS NULL OR v_to_account_type IS NULL THEN
        idx := tf_record.idx;
        success := FALSE;
        outgoing_id := NULL;
        incoming_id := NULL;
        error_message := 'One or both accounts not found';
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- Criar transação de saída (expense)
      INSERT INTO transactions (
        user_id, description, amount, date, type, category_id, account_id, 
        to_account_id, status
      )
      VALUES (
        p_user_id, tf_record.outgoing_description, -tf_record.amount,
        tf_record.date, 'expense', v_transfer_category_id, tf_record.from_account_id,
        tf_record.to_account_id, tf_record.status
      )
      RETURNING id INTO v_outgoing_id;

      -- Criar transação de entrada (income)
      INSERT INTO transactions (
        user_id, description, amount, date, type, category_id, account_id, 
        to_account_id, status
      )
      VALUES (
        p_user_id, tf_record.incoming_description, tf_record.amount,
        tf_record.date, 'income', v_transfer_category_id, tf_record.to_account_id,
        tf_record.from_account_id, tf_record.status
      )
      RETURNING id INTO v_incoming_id;

      -- Vincular transações
      UPDATE transactions SET linked_transaction_id = v_incoming_id WHERE id = v_outgoing_id;
      UPDATE transactions SET linked_transaction_id = v_outgoing_id WHERE id = v_incoming_id;

      -- Atualizar saldos se completada
      IF tf_record.status = 'completed' THEN
        IF v_from_account_type != 'credit' THEN
          UPDATE accounts SET balance = balance - tf_record.amount
          WHERE id = tf_record.from_account_id AND user_id = p_user_id;
        END IF;

        IF v_to_account_type != 'credit' THEN
          UPDATE accounts SET balance = balance + tf_record.amount
          WHERE id = tf_record.to_account_id AND user_id = p_user_id;
        END IF;
      END IF;

      idx := tf_record.idx;
      success := TRUE;
      outgoing_id := v_outgoing_id;
      incoming_id := v_incoming_id;
      error_message := NULL;
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      idx := (tf->>'idx')::INT;
      success := FALSE;
      outgoing_id := NULL;
      incoming_id := NULL;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- Garantir que as funções existentes estão disponíveis
GRANT EXECUTE ON FUNCTION bulk_create_transactions(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_create_transfers(UUID, JSONB) TO authenticated;
