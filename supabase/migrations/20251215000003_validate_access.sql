-- 🔐 CRITICAL FIX #1: Criar função validate_user_access como migration
-- Esta função deve ser chamada no INÍCIO de toda SECURITY DEFINER function
-- para prevenir escalação de privilégios

CREATE OR REPLACE FUNCTION public.validate_user_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Obter o ID do usuário autenticado do JWT
  v_auth_user_id := auth.uid();
  
  -- Validações
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: user not authenticated'
      USING ERRCODE = 'PGRST401';
  END IF;
  
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null'
      USING ERRCODE = 'PGRST400';
  END IF;
  
  -- SEGURANÇA: p_user_id DEVE corresponder ao usuário autenticado
  IF p_user_id != v_auth_user_id THEN
    RAISE EXCEPTION 'Unauthorized access: user_id does not match authenticated user'
      USING ERRCODE = 'PGRST403';
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Configurar permissões apropriadas
REVOKE ALL ON FUNCTION public.validate_user_access FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_user_access TO authenticated;

COMMENT ON FUNCTION public.validate_user_access IS 
'🔐 SECURITY FUNCTION: Valida que o p_user_id corresponde ao usuário autenticado.
Deve ser chamada no INÍCIO de toda SECURITY DEFINER function.
Previne escalação de privilégios (BUG FIX #4).
Lança exceções com ERRCODE apropriados para debugging.';
