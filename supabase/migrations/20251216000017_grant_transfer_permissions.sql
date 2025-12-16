-- Grant permissions
GRANT EXECUTE ON FUNCTION public.atomic_create_transfer(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT) TO authenticated, service_role;
