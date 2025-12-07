-- Adiciona coluna invoice_month para armazenar o mês da fatura de cartão de crédito
ALTER TABLE public.transactions 
ADD COLUMN invoice_month TEXT;

-- Adiciona comentário explicando o uso da coluna
COMMENT ON COLUMN public.transactions.invoice_month IS 'Mês da fatura no formato YYYY-MM (apenas para transações de cartão de crédito)';