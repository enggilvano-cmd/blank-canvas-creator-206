-- Corrigir função de recálculo de saldo para refletir o conceito correto de cartão de crédito
-- Agora o amount já vem com o sinal correto do insert, então basta somar

CREATE OR REPLACE FUNCTION public.recalculate_account_balance(
  p_account_id UUID,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS TABLE(
  new_balance NUMERIC,
  new_version INTEGER,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current_version INTEGER;
  v_calculated_balance NUMERIC;
  v_new_version INTEGER;
BEGIN
  -- Adquirir lock na linha da conta
  SELECT version INTO v_current_version
  FROM public.account_locks
  WHERE account_id = p_account_id
  FOR UPDATE;
  
  -- Verificar versão se fornecida (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
    RETURN QUERY SELECT NULL::NUMERIC, v_current_version, false, 'Version mismatch - account was modified';
    RETURN;
  END IF;
  
  -- Calcular saldo baseado em TODAS as transações completed
  -- CORREÇÃO: amount já vem com sinal correto do insert, basta somar
  -- Para cartões de crédito:
  --   - expense: amount negativo (aumenta dívida) → balance fica negativo = dívida
  --   - income: amount positivo (diminui dívida/pagamento) → balance pode ficar positivo = crédito a favor
  -- Para outras contas:
  --   - expense: amount negativo (sai dinheiro) → balance diminui
  --   - income: amount positivo (entra dinheiro) → balance aumenta
  -- IMPORTANTE: Não inclui transações pending, is_provision (estouradas), ou "Saldo Inicial" duplicadas
  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_calculated_balance
  FROM public.transactions t
  WHERE t.account_id = p_account_id
    AND t.status = 'completed';
  
  -- Atualizar saldo da conta
  UPDATE public.accounts
  SET balance = v_calculated_balance,
      updated_at = now()
  WHERE id = p_account_id;
  
  -- Incrementar versão do lock
  v_new_version := v_current_version + 1;
  
  UPDATE public.account_locks
  SET version = v_new_version,
      updated_at = now()
  WHERE account_id = p_account_id;
  
  -- Registrar na auditoria
  INSERT INTO public.financial_audit (
    user_id, action, table_name, record_id,
    balance_after, created_by
  )
  SELECT user_id, 'balance_recalc', 'accounts', p_account_id,
         v_calculated_balance, auth.uid()
  FROM public.accounts
  WHERE id = p_account_id;
  
  RETURN QUERY SELECT v_calculated_balance, v_new_version, true, NULL::TEXT;
END;
$$;