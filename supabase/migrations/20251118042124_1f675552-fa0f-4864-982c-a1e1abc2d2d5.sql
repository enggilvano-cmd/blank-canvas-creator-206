-- ============================================
-- Sistema de Partidas Dobradas
-- ============================================

-- Enum para tipos de conta contábil
CREATE TYPE account_category AS ENUM (
  'asset',           -- Ativo
  'liability',       -- Passivo
  'equity',          -- Patrimônio Líquido
  'revenue',         -- Receita
  'expense',         -- Despesa
  'contra_asset',    -- Conta Redutora do Ativo
  'contra_liability' -- Conta Redutora do Passivo
);

-- Enum para natureza da conta (débito ou crédito)
CREATE TYPE account_nature AS ENUM (
  'debit',   -- Natureza devedora
  'credit'   -- Natureza credora
);

-- Tabela: Plano de Contas
CREATE TABLE public.chart_of_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category account_category NOT NULL,
  nature account_nature NOT NULL,
  parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);

-- Tabela: Lançamentos Contábeis (Journal Entries)
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL,
  entry_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_chart_of_accounts_user_id ON public.chart_of_accounts(user_id);
CREATE INDEX idx_chart_of_accounts_parent_id ON public.chart_of_accounts(parent_id);
CREATE INDEX idx_chart_of_accounts_code ON public.chart_of_accounts(user_id, code);

CREATE INDEX idx_journal_entries_user_id ON public.journal_entries(user_id);
CREATE INDEX idx_journal_entries_transaction_id ON public.journal_entries(transaction_id);
CREATE INDEX idx_journal_entries_account_id ON public.journal_entries(account_id);
CREATE INDEX idx_journal_entries_entry_date ON public.journal_entries(user_id, entry_date);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Políticas para chart_of_accounts
CREATE POLICY "Users can view their own chart of accounts"
  ON public.chart_of_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chart of accounts"
  ON public.chart_of_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chart of accounts"
  ON public.chart_of_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chart of accounts"
  ON public.chart_of_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para journal_entries
CREATE POLICY "Users can view their own journal entries"
  ON public.journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own journal entries"
  ON public.journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
  ON public.journal_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
  ON public.journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Triggers
-- ============================================

-- Trigger para updated_at
CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Função: Inicializar Plano de Contas Padrão
-- ============================================

CREATE OR REPLACE FUNCTION public.initialize_chart_of_accounts(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ativo Circulante
  INSERT INTO public.chart_of_accounts (user_id, code, name, category, nature, description) VALUES
  (p_user_id, '1.01.01', 'Caixa', 'asset', 'debit', 'Dinheiro em caixa'),
  (p_user_id, '1.01.02', 'Bancos Conta Corrente', 'asset', 'debit', 'Saldo em contas correntes'),
  (p_user_id, '1.01.03', 'Bancos Conta Poupança', 'asset', 'debit', 'Saldo em contas poupança'),
  (p_user_id, '1.01.04', 'Investimentos', 'asset', 'debit', 'Aplicações financeiras'),
  
  -- Passivo Circulante
  (p_user_id, '2.01.01', 'Cartões de Crédito', 'liability', 'credit', 'Dívidas com cartões'),
  (p_user_id, '2.01.02', 'Fornecedores a Pagar', 'liability', 'credit', 'Contas a pagar'),
  (p_user_id, '2.01.03', 'Empréstimos a Pagar', 'liability', 'credit', 'Empréstimos de curto prazo'),
  
  -- Patrimônio Líquido
  (p_user_id, '3.01.01', 'Capital Próprio', 'equity', 'credit', 'Capital inicial'),
  (p_user_id, '3.02.01', 'Lucros Acumulados', 'equity', 'credit', 'Resultado acumulado'),
  
  -- Receitas
  (p_user_id, '4.01.01', 'Salários', 'revenue', 'credit', 'Receitas de salário'),
  (p_user_id, '4.01.02', 'Freelance', 'revenue', 'credit', 'Receitas de trabalho autônomo'),
  (p_user_id, '4.01.03', 'Investimentos', 'revenue', 'credit', 'Rendimentos de investimentos'),
  (p_user_id, '4.01.99', 'Outras Receitas', 'revenue', 'credit', 'Outras receitas'),
  
  -- Despesas
  (p_user_id, '5.01.01', 'Alimentação', 'expense', 'debit', 'Gastos com alimentação'),
  (p_user_id, '5.01.02', 'Transporte', 'expense', 'debit', 'Gastos com transporte'),
  (p_user_id, '5.01.03', 'Moradia', 'expense', 'debit', 'Aluguel e despesas residenciais'),
  (p_user_id, '5.01.04', 'Saúde', 'expense', 'debit', 'Gastos com saúde'),
  (p_user_id, '5.01.05', 'Educação', 'expense', 'debit', 'Gastos com educação'),
  (p_user_id, '5.01.06', 'Lazer', 'expense', 'debit', 'Gastos com entretenimento'),
  (p_user_id, '5.01.07', 'Vestuário', 'expense', 'debit', 'Gastos com roupas'),
  (p_user_id, '5.01.08', 'Tecnologia', 'expense', 'debit', 'Gastos com tecnologia'),
  (p_user_id, '5.01.99', 'Outras Despesas', 'expense', 'debit', 'Outras despesas');
  
END;
$$;

-- ============================================
-- Função: Validar Partidas Dobradas
-- ============================================

CREATE OR REPLACE FUNCTION public.validate_double_entry(p_transaction_id UUID)
RETURNS TABLE(
  is_valid BOOLEAN,
  total_debits NUMERIC,
  total_credits NUMERIC,
  difference NUMERIC,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debits NUMERIC;
  v_credits NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- Calcular total de débitos
  SELECT COALESCE(SUM(amount), 0)
  INTO v_debits
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'debit';
  
  -- Calcular total de créditos
  SELECT COALESCE(SUM(amount), 0)
  INTO v_credits
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'credit';
  
  v_diff := v_debits - v_credits;
  
  -- Retornar resultado
  RETURN QUERY SELECT
    (v_diff = 0) AS is_valid,
    v_debits AS total_debits,
    v_credits AS total_credits,
    v_diff AS difference,
    CASE 
      WHEN v_diff = 0 THEN 'Partidas dobradas válidas'
      WHEN v_diff > 0 THEN 'Débitos excedem créditos em ' || abs(v_diff)::text
      ELSE 'Créditos excedem débitos em ' || abs(v_diff)::text
    END AS message;
END;
$$;

-- ============================================
-- Função: Criar Lançamentos Automáticos
-- ============================================

CREATE OR REPLACE FUNCTION public.create_journal_entries_for_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_code TEXT;
  v_account_id UUID;
  v_category_name TEXT;
  v_category_type TEXT;
BEGIN
  -- Obter informações da categoria
  SELECT c.name, c.type
  INTO v_category_name, v_category_type
  FROM public.categories c
  WHERE c.id = NEW.category_id;
  
  -- Obter tipo da conta
  SELECT a.type INTO v_account_code
  FROM public.accounts a
  WHERE a.id = NEW.account_id;
  
  -- Determinar conta contábil baseada no tipo de transação
  IF NEW.type = 'income' THEN
    -- Receita: Débito na conta bancária, Crédito na receita
    
    -- Débito: Conta bancária (aumenta ativo)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND code LIKE '1.01.%'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type, 
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Receita (aumenta patrimônio)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND category = 'revenue'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
  ELSIF NEW.type = 'expense' THEN
    -- Despesa: Débito na despesa, Crédito na conta bancária
    
    -- Débito: Despesa (aumenta despesa)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND category = 'expense'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Conta bancária ou cartão (diminui ativo ou aumenta passivo)
    IF v_account_code = 'credit' THEN
      -- Cartão de crédito: aumenta passivo
      SELECT id INTO v_account_id
      FROM public.chart_of_accounts
      WHERE user_id = NEW.user_id
        AND code = '2.01.01'
        AND is_active = true
      LIMIT 1;
    ELSE
      -- Conta bancária: diminui ativo
      SELECT id INTO v_account_id
      FROM public.chart_of_accounts
      WHERE user_id = NEW.user_id
        AND code LIKE '1.01.%'
        AND is_active = true
      LIMIT 1;
    END IF;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
  ELSIF NEW.type = 'transfer' AND NEW.to_account_id IS NOT NULL THEN
    -- Transferência: Débito na conta destino, Crédito na conta origem
    
    -- Débito: Conta destino
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND code LIKE '1.01.%'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, 'Transferência para: ' || NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Conta origem
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, 'Transferência de: ' || NEW.description, NEW.date
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para criar lançamentos automáticos
CREATE TRIGGER create_journal_entries_on_transaction
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_journal_entries_for_transaction();

COMMENT ON TABLE public.chart_of_accounts IS 'Plano de contas para partidas dobradas';
COMMENT ON TABLE public.journal_entries IS 'Lançamentos contábeis (diário)';
COMMENT ON FUNCTION public.validate_double_entry IS 'Valida se débitos = créditos para uma transação';
COMMENT ON FUNCTION public.initialize_chart_of_accounts IS 'Inicializa plano de contas padrão para novo usuário';