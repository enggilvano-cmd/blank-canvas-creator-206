-- ============================================================================
-- FIX: Resolver conflito de sobrecarga da função get_transactions_totals
-- Problema: PGRST203 - Could not choose the best candidate function
-- Data: 14 de dezembro de 2025
-- 
-- O erro ocorre porque há múltiplas definições conflitantes da função
-- com diferentes assinaturas. Esta migração:
-- 1. Remove TODAS as sobrecargas antigas
-- 2. Cria UMA ÚNICA versão definitiva com todos os filtros
-- 3. Garante compatibilidade com frontend
-- ============================================================================

-- ============================================================================
-- STEP 1: Dropar TODAS as versões conhecidas da função
-- ============================================================================

-- Versões com diferentes assinaturas de date/text
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, date, date, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid) CASCADE;

-- Versões com boolean para is_fixed/is_provision (problema!)
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, uuid, uuid, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean) CASCADE;

-- Variações com invoice_month e text dates
DROP FUNCTION IF EXISTS public.get_transactions_totals(uuid, text, text, text, text, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_transactions_totals(
  p_user_id uuid, 
  p_type text, 
  p_status text, 
  p_account_id uuid, 
  p_category_id uuid, 
  p_account_type text, 
  p_date_from text, 
  p_date_to text, 
  p_invoice_month text,
  p_search text,
  p_is_fixed boolean,
  p_is_provision boolean
) CASCADE;

-- Versão mais recente que causa conflito
DROP FUNCTION IF EXISTS public.get_transactions_totals(
  uuid, text, text, text, text, text, boolean, boolean, date, date, text, text
) CASCADE;

-- ============================================================================
-- STEP 2: Criar UMA ÚNICA versão definitiva
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_transactions_totals(
  p_user_id UUID,
  p_type TEXT DEFAULT 'all',
  p_status TEXT DEFAULT 'all',
  p_account_id TEXT DEFAULT 'all',
  p_category_id TEXT DEFAULT 'all',
  p_account_type TEXT DEFAULT 'all',
  p_is_fixed BOOLEAN DEFAULT NULL,
  p_is_provision BOOLEAN DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_invoice_month TEXT DEFAULT 'all'
)
RETURNS TABLE (
  total_income NUMERIC,
  total_expenses NUMERIC,
  balance NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- ============================================================================
  -- SECURITY CHECK: Validar que p_user_id é o usuário autenticado
  -- ============================================================================
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: auth.uid() is NULL';
  END IF;
  
  IF v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user_id (%) does not match authenticated user (%)', 
      p_user_id::text, v_auth_user_id::text;
  END IF;

  -- ============================================================================
  -- MAIN QUERY: Calcular totais com filtros aplicados
  -- ============================================================================
  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      t.category_id,
      t.description,
      t.invoice_month,
      t.is_fixed,
      t.is_provision,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências dos cálculos de receita/despesa
      AND t.type != 'transfer'
      
      -- EXCLUIR receitas espelho (linked_transaction_id) apenas quando p_type = 'all'
      AND (p_type != 'all' OR NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL))
      
      -- EXCLUIR apenas o PAI das transações fixas (parent_transaction_id deve estar preenchido)
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      
      -- EXCLUIR Saldo Inicial
      AND t.description != 'Saldo Inicial'
      
      -- EXCLUIR provisões positivas (overspent: quando a provisão foi gasta)
      AND NOT (t.is_provision IS TRUE AND t.amount > 0)
      
      -- ========================
      -- APLICAR FILTROS
      -- ========================
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      AND (p_is_provision IS NULL OR t.is_provision = p_is_provision)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_invoice_month = 'all' OR t.invoice_month = p_invoice_month)
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
  )
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::NUMERIC as total_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as total_expenses,
    COALESCE(
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 
      0
    )::NUMERIC as balance
  FROM filtered_transactions;

EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't expose internals
  RAISE EXCEPTION 'Error calculating transaction totals: %', SQLERRM;
END;
$$;

-- ============================================================================
-- STEP 3: Documentar a função
-- ============================================================================

COMMENT ON FUNCTION public.get_transactions_totals IS
'🔧 UNIFIED VERSION - Calcula totais agregados (receitas, despesas e saldo).

ESTA É A ÚNICA VERSÃO AUTORIZADA DA FUNÇÃO. Todos os filtros devem ser suportados.

Parâmetros:
  p_user_id: UUID do usuário (OBRIGATÓRIO - validado contra auth.uid())
  p_type: Filtro por tipo (all, income, expense, transfer) - DEFAULT: all
  p_status: Filtro por status (all, pending, completed) - DEFAULT: all
  p_account_id: Filtro por account UUID (all = sem filtro) - DEFAULT: all
  p_category_id: Filtro por category UUID (all = sem filtro) - DEFAULT: all
  p_account_type: Filtro por tipo de conta (all, checking, savings, credit, etc.) - DEFAULT: all
  p_is_fixed: Filtro para transações fixas (NULL = sem filtro, TRUE/FALSE = específico) - DEFAULT: NULL
  p_is_provision: Filtro para provisões (NULL = sem filtro, TRUE/FALSE = específico) - DEFAULT: NULL
  p_date_from: Data inicial (NULL = sem limite) - DEFAULT: NULL
  p_date_to: Data final (NULL = sem limite) - DEFAULT: NULL
  p_search: Busca em description (NULL/vazio = sem filtro) - DEFAULT: NULL
  p_invoice_month: Filtro por mês de invoice (all = sem filtro) - DEFAULT: all

Retorna: TABLE com colunas (total_income, total_expenses, balance)

Regras Especiais:
  - SEMPRE exclui transferências (type = transfer)
  - Exclui receitas espelho (linked_transaction_id) apenas quando p_type = all
  - Exclui apenas o PAI de transações fixas (mantém filhas)
  - Exclui Saldo Inicial
  - Exclui provisões positivas (overspent)
  - Valida que p_user_id = auth.uid()

Última atualização: 14 de dezembro de 2025 - Fix PGRST203';

-- ============================================================================
-- STEP 4: Garantir permissões
-- ============================================================================

-- Revogar tudo do PUBLIC
REVOKE ALL ON FUNCTION public.get_transactions_totals FROM PUBLIC;

-- Conceder apenas para authenticated users
GRANT EXECUTE ON FUNCTION public.get_transactions_totals TO authenticated;

-- Conceder para service_role (admin operations)
GRANT EXECUTE ON FUNCTION public.get_transactions_totals TO service_role;

-- ============================================================================
-- VERIFICATION: Verificar que a função foi criada corretamente
-- ============================================================================

-- Este comando pode ser usado para verificar a assinatura:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_transactions_totals';
