-- Migração de dados: Converter saldos de cartões de crédito do conceito antigo para o novo
-- Conceito antigo: saldo = crédito disponível
-- Conceito novo: saldo = dívida (negativo)
-- Fórmula: novo_saldo = saldo_antigo - limite
-- Ex: Limite 5000, Saldo 3500 (disponível) → Novo saldo: 3500 - 5000 = -1500 (dívida)

DO $$
DECLARE
  v_account RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Processar apenas cartões de crédito com saldo positivo (conceito antigo)
  FOR v_account IN 
    SELECT id, balance, limit_amount, name
    FROM public.accounts
    WHERE type = 'credit'
      AND balance > 0  -- Só converter se ainda usa conceito antigo
      AND limit_amount IS NOT NULL
      AND limit_amount > 0
  LOOP
    -- Calcular novo saldo: saldo_atual - limite = dívida (negativo)
    v_new_balance := v_account.balance - v_account.limit_amount;
    
    -- Atualizar conta
    UPDATE public.accounts
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = v_account.id;
    
    -- Registrar na auditoria
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id,
      old_values, new_values, balance_before, balance_after,
      created_by
    )
    SELECT 
      user_id, 
      'credit_concept_migration',
      'accounts',
      v_account.id,
      jsonb_build_object('balance', v_account.balance, 'concept', 'old_available'),
      jsonb_build_object('balance', v_new_balance, 'concept', 'new_debt'),
      v_account.balance,
      v_new_balance,
      auth.uid()
    FROM public.accounts
    WHERE id = v_account.id;
    
    RAISE NOTICE 'Convertido cartão %: % → %', v_account.name, v_account.balance, v_new_balance;
  END LOOP;
END $$;