-- Add a flag to mark when invoice_month is manually overridden by the user
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS invoice_month_overridden boolean NOT NULL DEFAULT false;