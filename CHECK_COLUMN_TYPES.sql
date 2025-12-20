-- Execute esta query primeiro para verificar o tipo atual da coluna amount
SELECT 
  table_name,
  column_name, 
  data_type, 
  numeric_precision, 
  numeric_scale,
  udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('transactions', 'accounts')
  AND column_name IN ('amount', 'balance', 'limit_amount')
ORDER BY table_name, column_name;

-- Se data_type for "integer" ou "real" ou "double precision", 
-- ou se numeric_scale for 0 ou NULL, esse é o problema!

-- O tipo correto deve ser:
-- data_type: numeric
-- numeric_precision: 12
-- numeric_scale: 2
