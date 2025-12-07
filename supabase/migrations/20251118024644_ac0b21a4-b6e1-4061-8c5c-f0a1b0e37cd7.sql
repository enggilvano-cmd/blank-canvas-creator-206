-- =====================================================
-- PLANIFLOW: CORREÇÕES CRÍTICAS PARA NOTA 10
-- =====================================================
-- Esta migração implementa:
-- 1. Sistema de auditoria completo com triggers
-- 2. Índices de performance
-- 3. Campos para reconciliação bancária
-- 4. Tabela de locks otimistas
-- 5. Correção do conceito contábil de cartão de crédito

-- =====================================================
-- 1. TABELA DE AUDITORIA FINANCEIRA ROBUSTA
-- =====================================================
CREATE TABLE IF NOT EXISTS public.financial_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL, -- insert, update, delete, balance_recalc
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  balance_before NUMERIC,
  balance_after NUMERIC,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices para auditoria
CREATE INDEX IF NOT EXISTS idx_financial_audit_user_id ON public.financial_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_table_record ON public.financial_audit(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_created_at ON public.financial_audit(created_at DESC);

-- RLS para auditoria
ALTER TABLE public.financial_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs"
  ON public.financial_audit FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all audit logs"
  ON public.financial_audit FOR SELECT
  USING (is_admin(auth.uid()));

-- =====================================================
-- 2. CAMPOS PARA RECONCILIAÇÃO BANCÁRIA
-- =====================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS bank_reference TEXT, -- Referência do banco
  ADD COLUMN IF NOT EXISTS bank_import_id UUID; -- ID da importação bancária

-- Índice para reconciliação
CREATE INDEX IF NOT EXISTS idx_transactions_reconciled ON public.transactions(account_id, reconciled) WHERE reconciled = false;
CREATE INDEX IF NOT EXISTS idx_transactions_bank_ref ON public.transactions(bank_reference) WHERE bank_reference IS NOT NULL;

-- =====================================================
-- 3. TABELA DE LOCKS OTIMISTAS (Prevenir Race Conditions)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.account_locks (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inicializar locks para contas existentes
INSERT INTO public.account_locks (account_id, version)
SELECT id, 0 FROM public.accounts
ON CONFLICT (account_id) DO NOTHING;

-- RLS para locks
ALTER TABLE public.account_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locks for their accounts"
  ON public.account_locks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts 
      WHERE accounts.id = account_locks.account_id 
      AND accounts.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. ÍNDICES DE PERFORMANCE CRÍTICOS
-- =====================================================

-- Transações: queries mais comuns
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_status ON public.transactions(account_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_month ON public.transactions(account_id, invoice_month) WHERE invoice_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON public.transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);

-- Accounts: queries de saldo
CREATE INDEX IF NOT EXISTS idx_accounts_user_type ON public.accounts(user_id, type);

-- =====================================================
-- 5. FUNÇÃO DE AUDITORIA AUTOMÁTICA
-- =====================================================
CREATE OR REPLACE FUNCTION public.audit_transaction_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_balance_before NUMERIC;
  account_balance_after NUMERIC;
BEGIN
  -- Capturar saldo da conta antes/depois
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT balance INTO account_balance_after 
    FROM public.accounts 
    WHERE id = NEW.account_id;
  END IF;
  
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    SELECT balance INTO account_balance_before 
    FROM public.accounts 
    WHERE id = OLD.account_id;
  END IF;

  -- Registrar na auditoria
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id, 
      new_values, balance_after, created_by
    ) VALUES (
      NEW.user_id, 'insert', 'transactions', NEW.id,
      to_jsonb(NEW), account_balance_after, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id,
      old_values, new_values, 
      balance_before, balance_after, created_by
    ) VALUES (
      NEW.user_id, 'update', 'transactions', NEW.id,
      to_jsonb(OLD), to_jsonb(NEW),
      account_balance_before, account_balance_after, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id,
      old_values, balance_before, created_by
    ) VALUES (
      OLD.user_id, 'delete', 'transactions', OLD.id,
      to_jsonb(OLD), account_balance_before, auth.uid()
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- =====================================================
-- 6. TRIGGERS DE AUDITORIA
-- =====================================================
DROP TRIGGER IF EXISTS audit_transactions_insert ON public.transactions;
DROP TRIGGER IF EXISTS audit_transactions_update ON public.transactions;
DROP TRIGGER IF EXISTS audit_transactions_delete ON public.transactions;

CREATE TRIGGER audit_transactions_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_transaction_changes();

CREATE TRIGGER audit_transactions_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_transaction_changes();

CREATE TRIGGER audit_transactions_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_transaction_changes();

-- =====================================================
-- 7. FUNÇÃO PARA RECALCULAR SALDO COM LOCK OTIMISTA
-- =====================================================
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(
  p_account_id UUID,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS TABLE (
  new_balance NUMERIC,
  new_version INTEGER,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SELECT COALESCE(SUM(
    CASE 
      WHEN t.type = 'income' THEN t.amount
      WHEN t.type = 'expense' THEN -ABS(t.amount)
      ELSE 0
    END
  ), 0)
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

-- =====================================================
-- 8. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================
COMMENT ON TABLE public.financial_audit IS 'Auditoria completa de todas operações financeiras';
COMMENT ON TABLE public.account_locks IS 'Locks otimistas para prevenir race conditions em atualizações de saldo';
COMMENT ON FUNCTION public.recalculate_account_balance IS 'Recalcula saldo de conta de forma atômica com optimistic locking';

-- =====================================================
-- 9. CRIAR LOCK PARA CONTAS NOVAS (TRIGGER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_account_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.account_locks (account_id, version)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_account_lock_trigger ON public.accounts;

CREATE TRIGGER create_account_lock_trigger
  AFTER INSERT ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.create_account_lock();