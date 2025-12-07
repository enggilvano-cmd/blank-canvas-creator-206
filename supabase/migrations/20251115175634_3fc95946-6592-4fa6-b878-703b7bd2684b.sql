-- Add is_fixed column to distinguish fixed transactions from recurring transactions
ALTER TABLE public.transactions 
ADD COLUMN is_fixed boolean DEFAULT false;

-- Create index for better performance on fixed transactions queries
CREATE INDEX idx_transactions_is_fixed ON public.transactions(is_fixed) WHERE is_fixed = true;

-- Update existing fixed transactions (is_recurring=true AND recurrence_end_date IS NULL)
UPDATE public.transactions 
SET is_fixed = true 
WHERE is_recurring = true 
  AND recurrence_type = 'monthly' 
  AND recurrence_end_date IS NULL;

-- Reset is_recurring for fixed transactions to separate them completely
UPDATE public.transactions 
SET is_recurring = false 
WHERE is_fixed = true;