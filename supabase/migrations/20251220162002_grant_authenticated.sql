-- Conceder permissões para authenticated e service_role
GRANT EXECUTE ON FUNCTION public.atomic_delete_transaction TO authenticated;
