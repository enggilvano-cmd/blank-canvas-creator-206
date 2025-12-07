-- ============================================
-- CORREÇÃO: Remover lógica duplicada de journal_entries
-- Decisão: Manter criação APENAS nos edge functions
-- Motivo: Mais controle, melhor debugging, lógica centralizada
-- ============================================

-- 1. Remover trigger que cria journal_entries automaticamente
DROP TRIGGER IF EXISTS create_journal_entries_on_transaction ON public.transactions;

-- 2. Remover função que criava journal_entries
DROP FUNCTION IF EXISTS public.create_journal_entries_for_transaction();

-- 3. Adicionar comentário explicativo
COMMENT ON TABLE public.journal_entries IS 
  'Lançamentos contábeis (diário) - Criados APENAS pelos edge functions atômicos para garantir controle total e evitar duplicações';

COMMENT ON TABLE public.transactions IS 
  'Transações financeiras - Journal entries são criados pelos edge functions (atomic-transaction, atomic-transfer, atomic-pay-bill) quando status=completed';

-- ============================================
-- VALIDAÇÃO: Garantir que journal_entries estão sendo criados corretamente
-- ============================================

-- Função auxiliar para verificar partidas dobradas após criação
CREATE OR REPLACE FUNCTION public.verify_journal_entries_balance(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debit_total NUMERIC;
  v_credit_total NUMERIC;
BEGIN
  -- Calcular totais
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_debit_total, v_credit_total
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id;
  
  -- Verificar se débito = crédito (com tolerância de 0.01 para arredondamentos)
  RETURN ABS(v_debit_total - v_credit_total) < 0.01;
END;
$$;

COMMENT ON FUNCTION public.verify_journal_entries_balance IS 
  'Verifica se os journal_entries de uma transação estão balanceados (débito = crédito)';

-- ============================================
-- ÍNDICES: Otimizar queries de journal_entries
-- ============================================

-- Índice composto para validações rápidas
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_type 
  ON public.journal_entries(transaction_id, entry_type);

-- Índice para relatórios por período e tipo
CREATE INDEX IF NOT EXISTS idx_journal_entries_date_type 
  ON public.journal_entries(user_id, entry_date, entry_type);

-- ============================================
-- AUDITORIA: Log desta mudança arquitetural
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    INSERT INTO public.audit_logs (
      action, 
      resource_type, 
      resource_id,
      new_values
    ) VALUES (
      'architecture_change',
      'journal_entries',
      gen_random_uuid(),
      jsonb_build_object(
        'change', 'Removed trigger create_journal_entries_on_transaction',
        'reason', 'Avoid duplicate logic - journal_entries now created only by edge functions',
        'affected_functions', ARRAY['atomic-transaction', 'atomic-transfer', 'atomic-pay-bill', 'atomic-edit-transaction'],
        'timestamp', now()
      )
    );
  END IF;
END $$;