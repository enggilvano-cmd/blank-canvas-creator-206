-- Fix atomic_create_fixed_transaction to properly handle provisions and create child transactions
-- Step 5: Grant permissions

GRANT EXECUTE ON FUNCTION public.atomic_create_fixed_transaction TO authenticated;
