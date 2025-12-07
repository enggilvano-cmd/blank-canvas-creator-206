-- Parte 1: Adicionar o tipo 'trial' ao enum user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'trial';

-- Adicionar configuração de período trial no sistema
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('trial_period_days', '7', 'Número de dias do período trial para novos usuários')
ON CONFLICT (setting_key) DO NOTHING;