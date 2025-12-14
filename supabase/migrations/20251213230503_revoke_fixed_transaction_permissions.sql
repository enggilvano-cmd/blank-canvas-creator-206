-- Fix atomic_create_fixed_transaction to properly handle provisions and create child transactions
-- Step 4: Set permissions

REVOKE ALL ON FUNCTION public.atomic_create_fixed_transaction FROM PUBLIC;
