-- Atualizar usuários trial existentes sem data de expiração
DO $$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- Obter quantidade de dias de trial da configuração
  SELECT setting_value::INTEGER INTO v_trial_days
  FROM public.system_settings
  WHERE setting_key = 'trial_days';
  
  -- Se não houver configuração, usar 30 dias como padrão
  IF v_trial_days IS NULL THEN
    v_trial_days := 30;
  END IF;

  -- Atualizar perfis de usuários trial que não têm data de expiração
  UPDATE public.profiles p
  SET trial_expires_at = p.created_at + (v_trial_days || ' days')::INTERVAL
  WHERE p.trial_expires_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = p.user_id 
      AND ur.role = 'trial'
    );

  RAISE NOTICE 'Usuários trial atualizados com sucesso';
END $$;