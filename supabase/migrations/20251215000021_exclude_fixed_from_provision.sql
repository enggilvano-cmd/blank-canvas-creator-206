CREATE OR REPLACE FUNCTION public.handle_provision_deduction()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $trigger$
DECLARE
  v_provision_id UUID;
  v_provision_account_id UUID;
  v_provision_status public.transaction_status;
  v_diff NUMERIC;
  v_is_fixed BOOLEAN;
  v_is_provision BOOLEAN;
BEGIN
  -- Obter flags (usando NEW para INSERT/UPDATE, OLD para DELETE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_is_fixed := NEW.is_fixed;
    v_is_provision := NEW.is_provision;
  ELSE
    v_is_fixed := OLD.is_fixed;
    v_is_provision := OLD.is_provision;
  END IF;

  -- 1. Ignorar se a própria transação for uma provisão (evitar auto-referência/loop)
  IF v_is_provision THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 2. Ignorar se for uma transação fixa (Provisões devem ser abatidas apenas por transações variáveis)
  -- Isso atende à solicitação: "a edição de transação fixa filha nao deve alterar transação provisão"
  IF v_is_fixed THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  
  -- Calcular a diferença baseada na operação
  IF TG_OP = 'INSERT' THEN
    v_diff := NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := NEW.amount - OLD.amount;
    -- Se não houve mudança de valor, retornar
    IF v_diff = 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_diff := -OLD.amount;
  END IF;

  -- Encontrar a provisão correspondente
  -- Deve ser do mesmo mês, mesma categoria, e ser uma instância (filha)
  SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
  FROM transactions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND category_id = COALESCE(NEW.category_id, OLD.category_id)
    AND is_provision = true
    AND date_trunc('month', date) = date_trunc('month', COALESCE(NEW.date, OLD.date))
    AND id != COALESCE(NEW.id, OLD.id)
    AND parent_transaction_id IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF v_provision_id IS NOT NULL THEN
    -- Atualizar o valor da provisão
    -- Subtrair a diferença (se gastou mais, provisão diminui/consome mais)
    UPDATE transactions
    SET amount = amount - v_diff
    WHERE id = v_provision_id;

    -- Recalcular saldo da conta da provisão se ela estiver concluída
    IF v_provision_status = 'completed' THEN
      PERFORM recalculate_account_balance(v_provision_account_id);
    END IF;
  END IF;
    
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;
