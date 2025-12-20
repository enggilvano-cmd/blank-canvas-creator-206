-- CORREÇÃO CRÍTICA: Remover ON DELETE CASCADE da foreign key parent_transaction_id
-- O CASCADE estava fazendo com que todas as filhas fossem deletadas quando a pai era deletada
-- Agora usamos ON DELETE SET NULL para preservar as filhas (especialmente as concluídas)

-- 1. Primeiro, dropar a constraint existente
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_parent_transaction_id_fkey;

-- 2. Recriar a constraint SEM CASCADE (usando SET NULL)
-- Quando a pai for deletada, as filhas terão parent_transaction_id = NULL
ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_parent_transaction_id_fkey 
FOREIGN KEY (parent_transaction_id) 
REFERENCES public.transactions(id) 
ON DELETE SET NULL;

-- Comentário explicativo
COMMENT ON CONSTRAINT transactions_parent_transaction_id_fkey ON public.transactions IS 
'Foreign key para transação pai. Usa SET NULL ao invés de CASCADE para preservar transações filhas concluídas quando a pai é removida.';
