-- Parte 2: Atualizar funções para usar o novo tipo 'trial'

-- Atualizar a função handle_new_user para criar usuários trial automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_whatsapp TEXT;
  v_trial_days INTEGER;
  v_trial_expires_at TIMESTAMP WITH TIME ZONE;
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
  
  -- Obter o número de dias de trial das configurações do sistema
  SELECT COALESCE(setting_value::integer, 7)
  INTO v_trial_days
  FROM public.system_settings
  WHERE setting_key = 'trial_period_days';
  
  -- Calcular data de expiração do trial
  v_trial_expires_at := now() + (v_trial_days || ' days')::interval;
  
  -- Log para debug
  RAISE LOG 'Creating trial user: %, full_name: %, whatsapp: %, trial_days: %, expires_at: %', 
    NEW.id, v_full_name, v_whatsapp, v_trial_days, v_trial_expires_at;
  
  -- Inserir perfil para o novo usuário com role trial
  INSERT INTO public.profiles (
    user_id, 
    email, 
    full_name, 
    whatsapp, 
    role, 
    is_active,
    trial_expires_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_whatsapp,
    'trial'::user_role,
    true,
    v_trial_expires_at
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

-- Atualizar função is_subscription_active para incluir trial
CREATE OR REPLACE FUNCTION public.is_subscription_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE 
    WHEN role = 'admin' THEN true
    WHEN role = 'user' THEN true
    WHEN role = 'trial' THEN COALESCE(trial_expires_at > now(), false)
    WHEN role = 'subscriber' THEN COALESCE(subscription_expires_at > now(), false)
    ELSE false
  END
  FROM public.profiles 
  WHERE user_id = check_user_id 
  AND is_active = true;
$function$;

-- Atualizar função para desativar trials expirados
CREATE OR REPLACE FUNCTION public.deactivate_expired_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET is_active = false
  WHERE trial_expires_at < now() 
  AND is_active = true
  AND role = 'trial';
  
  -- Log deactivations
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  SELECT user_id, 'trial_expired', 'profile', user_id::text
  FROM public.profiles
  WHERE trial_expires_at < now() 
  AND is_active = false
  AND role = 'trial';
END;
$function$;