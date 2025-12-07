-- Fix para inicializar plano de contas automaticamente para novos usuários
-- e corrigir usuários existentes que não possuem plano de contas

-- 1. Atualizar função handle_new_user para incluir inicialização do plano de contas
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

  -- ✅ IMPORTANTE: Inicializar plano de contas
  PERFORM public.initialize_chart_of_accounts(NEW.id);

  RETURN NEW;
END;
$function$;

-- 2. Inicializar plano de contas para usuários existentes que não possuem
DO $migration$
DECLARE
  user_record RECORD;
  chart_count INTEGER;
BEGIN
  -- Para cada usuário ativo
  FOR user_record IN 
    SELECT DISTINCT p.user_id 
    FROM public.profiles p
    WHERE p.is_active = true
  LOOP
    -- Verificar se já possui plano de contas
    SELECT COUNT(*) INTO chart_count
    FROM public.chart_of_accounts
    WHERE user_id = user_record.user_id;

    -- Se não possui, criar
    IF chart_count = 0 THEN
      PERFORM public.initialize_chart_of_accounts(user_record.user_id);
      RAISE NOTICE 'Plano de contas inicializado para usuário %', user_record.user_id;
    END IF;
  END LOOP;
END;
$migration$;