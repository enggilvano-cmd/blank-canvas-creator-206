-- Fix atomic_create_fixed_transaction to properly handle provisions and create child transactions
-- Step 1: Drop existing function
DROP FUNCTION IF EXISTS public.atomic_create_fixed_transaction(uuid, text, numeric, date, transaction_type, uuid, uuid, transaction_status, boolean);
