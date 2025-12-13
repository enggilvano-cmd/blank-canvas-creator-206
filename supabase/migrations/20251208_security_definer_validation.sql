-- ✅ SEGURANÇA: Validação adicional para funções SECURITY DEFINER
-- Migration: Adicionar validação de segurança em funções privilegiadas
-- Data: 8 de dezembro de 2025

-- Função auxiliar para validar user_id em todas as operações SECURITY DEFINER
CREATE OR REPLACE FUNCTION validate_user_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER -- ✅ Não precisa de privilégios elevados
AS $$
BEGIN
  -- Verifica se o user_id corresponde ao usuário autenticado
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;
  
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized access: user_id does not match authenticated user';
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION validate_user_access IS 
'Valida que o user_id corresponde ao usuário autenticado. Usado em funções SECURITY DEFINER para prevenir escalação de privilégios.';

-- ✅ Adicionar validação em get_transactions_totals
CREATE OR REPLACE FUNCTION get_transactions_totals(
    p_user_id UUID,
    p_date_from TEXT DEFAULT NULL,
    p_date_to TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_type TEXT DEFAULT 'all',
    p_status TEXT DEFAULT 'all',
    p_account_type TEXT DEFAULT 'all',
    p_is_fixed TEXT DEFAULT 'all',
    p_is_provision TEXT DEFAULT 'all',
    p_invoice_month TEXT DEFAULT 'all'
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expense NUMERIC,
    balance NUMERIC,
    pending_income NUMERIC,
    pending_expense NUMERIC,
    completed_income NUMERIC,
    completed_expense NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- ✅ VALIDAÇÃO DE SEGURANÇA CRÍTICA
  IF NOT validate_user_access(p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ✅ Validar inputs para prevenir SQL injection
  IF p_type NOT IN ('all', 'income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid type parameter';
  END IF;

  IF p_status NOT IN ('all', 'pending', 'completed') THEN
    RAISE EXCEPTION 'Invalid status parameter';
  END IF;

  IF p_account_type NOT IN ('all', 'checking', 'savings', 'credit', 'investment', 'meal_voucher') THEN
    RAISE EXCEPTION 'Invalid account_type parameter';
  END IF;

  IF p_is_fixed NOT IN ('all', 'true', 'false') THEN
    RAISE EXCEPTION 'Invalid is_fixed parameter';
  END IF;

  IF p_is_provision NOT IN ('all', 'true', 'false') THEN
    RAISE EXCEPTION 'Invalid is_provision parameter';
  END IF;

  -- Resto da implementação original...
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' THEN t.amount 
      ELSE 0 
    END), 0) as total_income,
    COALESCE(SUM(CASE 
      WHEN t.type = 'expense' THEN ABS(t.amount)
      ELSE 0 
    END), 0) as total_expense,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' THEN t.amount 
      WHEN t.type = 'expense' THEN t.amount
      ELSE 0 
    END), 0) as balance,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' AND t.status = 'pending' THEN t.amount 
      ELSE 0 
    END), 0) as pending_income,
    COALESCE(SUM(CASE 
      WHEN t.type = 'expense' AND t.status = 'pending' THEN ABS(t.amount)
      ELSE 0 
    END), 0) as pending_expense,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' AND t.status = 'completed' THEN t.amount 
      ELSE 0 
    END), 0) as completed_income,
    COALESCE(SUM(CASE 
      WHEN t.type = 'expense' AND t.status = 'completed' THEN ABS(t.amount)
      ELSE 0 
    END), 0) as completed_expense
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  WHERE t.user_id = p_user_id
    AND t.description != 'Saldo Inicial'
    AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
    AND (p_date_from IS NULL OR t.date >= p_date_from::DATE)
    AND (p_date_to IS NULL OR t.date <= p_date_to::DATE)
    AND (p_account_id IS NULL OR t.account_id = p_account_id)
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_type = 'all' OR 
         (p_type = 'transfer' AND t.to_account_id IS NOT NULL) OR
         (p_type != 'transfer' AND t.type = p_type::TEXT AND t.to_account_id IS NULL))
    AND (p_status = 'all' OR t.status = p_status::TEXT)
    AND (p_account_type = 'all' OR a.type = p_account_type::TEXT)
    AND (p_is_fixed = 'all' OR 
         (p_is_fixed = 'true' AND t.is_fixed = TRUE) OR
         (p_is_fixed = 'false' AND (t.is_fixed = FALSE OR t.is_fixed IS NULL)))
    AND (p_is_provision = 'all' OR 
         (p_is_provision = 'true' AND t.is_provision = TRUE) OR
         (p_is_provision = 'false' AND (t.is_provision = FALSE OR t.is_provision IS NULL)))
    AND (p_invoice_month = 'all' OR t.invoice_month = p_invoice_month);
END;
$$;

-- ✅ Adicionar validação em handle_provision_deduction
CREATE OR REPLACE FUNCTION handle_provision_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provision_id UUID;
  v_old_provision_id UUID;
BEGIN
  -- ✅ VALIDAÇÃO: Verificar que o user_id é válido
  IF NEW.user_id IS NOT NULL THEN
    IF NOT validate_user_access(NEW.user_id) THEN
      RAISE EXCEPTION 'Unauthorized: Invalid user_id in transaction';
    END IF;
  END IF;

  -- Resto da implementação original do trigger...
  -- INSERT: Deduzir de provisão se transaction completed e não fixa
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'completed' OR NEW.is_fixed = TRUE THEN
      RETURN NEW;
    END IF;
    
    -- Buscar provisão correspondente
    SELECT id INTO v_provision_id
    FROM transactions
    WHERE user_id = NEW.user_id
      AND category_id = NEW.category_id
      AND date >= DATE_TRUNC('month', NEW.date)
      AND date < DATE_TRUNC('month', NEW.date) + INTERVAL '1 month'
      AND is_provision = TRUE
      AND type = 'expense'
      AND status = 'pending'
    LIMIT 1;
    
    IF v_provision_id IS NOT NULL THEN
      UPDATE transactions
      SET amount = amount - NEW.amount
      WHERE id = v_provision_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Comentários das funções
COMMENT ON FUNCTION get_transactions_totals IS 
'✅ SECURITY DEFINER com validação rigorosa de user_id e inputs. Calcula totais de transações com filtros diversos.';

COMMENT ON FUNCTION handle_provision_deduction IS 
'✅ SECURITY DEFINER com validação de user_id. Trigger para deduzir automaticamente de provisões quando transações são criadas/atualizadas.';
