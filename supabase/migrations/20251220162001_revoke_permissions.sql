-- Garantir permissões para a função atomic_delete_transaction
REVOKE ALL ON FUNCTION public.atomic_delete_transaction FROM PUBLIC;
