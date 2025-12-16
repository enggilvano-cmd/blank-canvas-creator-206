-- Grant execute permission on the new atomic_create_transfer function signature
GRANT EXECUTE ON FUNCTION public.atomic_create_transfer(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, public.transaction_status) TO authenticated, service_role;
