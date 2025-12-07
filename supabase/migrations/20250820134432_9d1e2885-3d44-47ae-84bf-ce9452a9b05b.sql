-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION public.initialize_default_categories(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, type, color) VALUES
    (p_user_id, 'Alimentação', 'expense', '#ef4444'),
    (p_user_id, 'Transporte', 'expense', '#f97316'),
    (p_user_id, 'Saúde', 'expense', '#84cc16'),
    (p_user_id, 'Educação', 'expense', '#06b6d4'),
    (p_user_id, 'Lazer', 'expense', '#8b5cf6'),
    (p_user_id, 'Moradia', 'expense', '#ec4899'),
    (p_user_id, 'Vestuário', 'expense', '#10b981'),
    (p_user_id, 'Tecnologia', 'expense', '#3b82f6'),
    (p_user_id, 'Investimentos', 'both', '#6366f1'),
    (p_user_id, 'Salário', 'income', '#22c55e'),
    (p_user_id, 'Freelance', 'income', '#14b8a6'),
    (p_user_id, 'Vendas', 'income', '#f59e0b'),
    (p_user_id, 'Outros', 'both', '#6b7280');
END;
$$;

-- Function to initialize default settings for new users
CREATE OR REPLACE FUNCTION public.initialize_default_settings(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, currency, theme, notifications, auto_backup, language) 
  VALUES (p_user_id, 'BRL', 'system', true, false, 'pt-BR')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;