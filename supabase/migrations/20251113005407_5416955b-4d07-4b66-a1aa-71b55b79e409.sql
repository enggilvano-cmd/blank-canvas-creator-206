-- Adicionar o tipo 'trial' ao enum user_role
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'trial' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'trial';
  END IF;
END $$;

-- Adicionar configuração de período trial no sistema
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('trial_period_days', '7', 'Número de dias do período trial para novos usuários')
ON CONFLICT (setting_key) DO NOTHING;