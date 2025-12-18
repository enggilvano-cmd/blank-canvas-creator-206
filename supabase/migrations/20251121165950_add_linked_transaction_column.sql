-- Add linked_transaction_id column to transactions table for transfer relationships
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.linked_transaction_id IS 
'References the linked transaction in a transfer. Used to connect the outgoing and incoming transactions.';
