-- 1. Ensure the column exists
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_provision BOOLEAN DEFAULT false;
