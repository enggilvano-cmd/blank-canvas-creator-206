-- Recalcular todos os saldos das contas usando a nova lógica
-- Isso garante que todos os saldos estejam consistentes com o novo conceito

DO $$
DECLARE
  v_account RECORD;
  v_result RECORD;
BEGIN
  -- Processar todas as contas
  FOR v_account IN 
    SELECT id, name, type, balance
    FROM public.accounts
    ORDER BY type, name
  LOOP
    -- Chamar função de recálculo atômico
    SELECT * INTO v_result
    FROM public.recalculate_account_balance(v_account.id)
    LIMIT 1;
    
    IF v_result.success THEN
      RAISE NOTICE 'Conta % (%) recalculada: % → %', 
        v_account.name, 
        v_account.type,
        v_account.balance, 
        v_result.new_balance;
    ELSE
      RAISE WARNING 'Erro ao recalcular conta %: %', 
        v_account.name, 
        v_result.error_message;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Recálculo completo de saldos finalizado!';
END $$;