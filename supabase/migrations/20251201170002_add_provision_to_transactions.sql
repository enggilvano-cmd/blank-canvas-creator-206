-- Add is_provision column to transactions table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_provision BOOLEAN DEFAULT false;

