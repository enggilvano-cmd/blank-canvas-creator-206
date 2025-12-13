-- 🚨 HOTFIX: Criar função validate_user_access que está faltando
-- Execute este SQL no Supabase Dashboard → SQL Editor

-- Função auxiliar para validar user_id em todas as operações SECURITY DEFINER
CREATE OR REPLACE FUNCTION validate_user_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Verifica se o user_id corresponde ao usuário autenticado
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;
  
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized access: user_id does not match authenticated user';
  END IF;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_user_access IS 
'Valida que o user_id corresponde ao usuário autenticado. Usado em funções SECURITY DEFINER para prevenir escalação de privilégios.';
