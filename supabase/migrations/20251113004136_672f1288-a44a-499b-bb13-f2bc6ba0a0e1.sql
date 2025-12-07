-- Melhorar a função handle_new_user para garantir que whatsapp e role sejam salvos corretamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_whatsapp TEXT;
BEGIN
  -- Extrair dados dos metadados com fallback
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'fullName',
    NEW.email
  );
  
  v_whatsapp := COALESCE(
    NEW.raw_user_meta_data->>'whatsapp',
    NEW.raw_user_meta_data->>'phone'
  );
  
  -- Log para debug (pode ser removido depois)
  RAISE LOG 'Creating profile for user: %, full_name: %, whatsapp: %', 
    NEW.id, v_full_name, v_whatsapp;
  
  -- Inserir perfil para o novo usuário
  INSERT INTO public.profiles (
    user_id, 
    email, 
    full_name, 
    whatsapp, 
    role, 
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_whatsapp,
    'user'::user_role,
    true
  );
  
  -- Log da atividade de signup
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  VALUES (NEW.id, 'user_signup', 'auth', NEW.id::text);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    -- Não falhar o signup mesmo se houver erro
    RETURN NEW;
END;
$function$;