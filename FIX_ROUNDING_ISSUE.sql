-- =====================================================
-- EXECUTE ESTE SQL NO PAINEL DO SUPABASE (SQL EDITOR)
-- Isso vai corrigir o problema de arredondamento de valores
-- =====================================================

-- PRIMEIRO: Verificar tipo atual da coluna
SELECT 
  table_name,
  column_name, 
  data_type, 
  numeric_precision, 
  numeric_scale
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'transactions' 
  AND column_name = 'amount';

-- Se numeric_scale for NULL ou 0, esse é o problema!
-- O correto é numeric_scale = 2

-- =====================================================
-- CORREÇÃO: Alterar coluna amount para DECIMAL(12,2)
-- =====================================================
ALTER TABLE public.transactions ALTER COLUMN amount TYPE DECIMAL(12,2);

-- Alterar coluna balance das contas para DECIMAL(12,2)
ALTER TABLE public.accounts ALTER COLUMN balance TYPE DECIMAL(12,2);

-- Alterar coluna limit_amount das contas para DECIMAL(12,2)  
ALTER TABLE public.accounts ALTER COLUMN limit_amount TYPE DECIMAL(12,2);

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================
SELECT 
  table_name,
  column_name, 
  data_type, 
  numeric_precision, 
  numeric_scale
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('transactions', 'accounts')
  AND column_name IN ('amount', 'balance', 'limit_amount')
ORDER BY table_name, column_name;

-- Se o resultado mostrar numeric_scale = 2 para todas, está correto!
