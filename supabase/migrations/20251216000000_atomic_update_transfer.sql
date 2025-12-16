CREATE OR REPLACE FUNCTION atomic_update_transfer(
    p_transfer_id UUID,
    p_amount INT,
    p_date DATE
)
RETURNS VOID AS $$
DECLARE
    v_from_account_id UUID;
    v_to_account_id UUID;
    v_expense_transaction_id UUID;
    v_income_transaction_id UUID;
    v_old_expense_amount INT;
    v_old_income_amount INT;
BEGIN
    -- Encontrar as duas transações e suas contas
    SELECT id, account_id, amount 
    INTO v_expense_transaction_id, v_from_account_id, v_old_expense_amount
    FROM transactions
    WHERE transfer_id = p_transfer_id AND type = 'expense'
    LIMIT 1;

    SELECT id, account_id, amount 
    INTO v_income_transaction_id, v_to_account_id, v_old_income_amount
    FROM transactions
    WHERE transfer_id = p_transfer_id AND type = 'income'
    LIMIT 1;

    -- Se não encontrar as duas transações, gerar um erro
    IF v_expense_transaction_id IS NULL OR v_income_transaction_id IS NULL THEN
        RAISE EXCEPTION 'Transfer pair not found for transfer_id: %', p_transfer_id;
    END IF;

    -- Reverter os saldos antigos nas contas
    UPDATE accounts
    SET balance = balance - v_old_expense_amount
    WHERE id = v_from_account_id;

    UPDATE accounts
    SET balance = balance - v_old_income_amount
    WHERE id = v_to_account_id;

    -- Atualizar as transações com os novos valores
    UPDATE transactions
    SET 
        amount = -ABS(p_amount),
        date = p_date
    WHERE id = v_expense_transaction_id;

    UPDATE transactions
    SET 
        amount = ABS(p_amount),
        date = p_date
    WHERE id = v_income_transaction_id;

    -- Aplicar os novos saldos nas contas
    UPDATE accounts
    SET balance = balance - ABS(p_amount)
    WHERE id = v_from_account_id;

    UPDATE accounts
    SET balance = balance + ABS(p_amount)
    WHERE id = v_to_account_id;

END;
$$ LANGUAGE plpgsql;
