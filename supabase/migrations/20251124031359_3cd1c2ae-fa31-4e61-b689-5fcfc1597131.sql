-- Modificar função handle_new_user para registrar usuários com role 'trial' por padrão
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- Obter quantidade de dias de trial da configuração do sistema
  SELECT setting_value::INTEGER INTO v_trial_days
  FROM public.system_settings
  WHERE setting_key = 'trial_days';
  
  -- Se não houver configuração, usar 30 dias como padrão
  IF v_trial_days IS NULL THEN
    v_trial_days := 30;
  END IF;

  -- Inserir perfil com data de expiração do trial
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, is_active, trial_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'whatsapp',
    true,
    now() + (v_trial_days || ' days')::INTERVAL
  );

  -- Inserir role 'trial' para o novo usuário
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'trial')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Garantir que existe uma configuração padrão para trial_days
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('trial_days', '30', 'Número de dias do período de trial para novos usuários')
ON CONFLICT (setting_key) DO NOTHING;