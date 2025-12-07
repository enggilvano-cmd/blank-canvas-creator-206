-- Remove reconciliation fields from transactions table
ALTER TABLE public.transactions
DROP COLUMN IF EXISTS reconciled,
DROP COLUMN IF EXISTS reconciled_at,
DROP COLUMN IF EXISTS reconciled_by;

-- Drop index if it exists (it might have been dropped automatically with the column, but good to be safe)
DROP INDEX IF EXISTS idx_transactions_reconciled;
