-- Fix atomic_create_fixed_transaction to properly handle provisions and create child transactions
-- Step 3: Add documentation

COMMENT ON FUNCTION public.atomic_create_fixed_transaction IS
'Create a fixed (recurring monthly) transaction with child instances for all future months.
Handles provision mode by calculating deductions from existing non-provision transactions.
Returns: success, parent_id, created_count (parent + children), error_message';
