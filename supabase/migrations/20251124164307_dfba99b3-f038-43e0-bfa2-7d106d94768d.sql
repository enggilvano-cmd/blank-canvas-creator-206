-- Adicionar coluna chart_account_id na tabela categories
ALTER TABLE public.categories
ADD COLUMN chart_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX idx_categories_chart_account_id ON public.categories(chart_account_id);

-- Comentário explicativo
COMMENT ON COLUMN public.categories.chart_account_id IS 'Relaciona a categoria de transação com a conta contábil correspondente no plano de contas';