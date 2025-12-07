-- Create system settings table for admin configurations
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and modify system settings
CREATE POLICY "Admins can view system settings" 
ON public.system_settings 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update system settings" 
ON public.system_settings 
FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert system settings" 
ON public.system_settings 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

-- Insert default trial period setting (7 days)
INSERT INTO public.system_settings (setting_key, setting_value, description) 
VALUES ('trial_period_days', '7', 'Número de dias de trial para novos usuários');

-- Function to get system setting value
CREATE OR REPLACE FUNCTION public.get_system_setting(p_setting_key text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT setting_value 
  FROM public.system_settings 
  WHERE setting_key = p_setting_key;
$function$;

-- Update handle_new_user function to use dynamic trial period
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  trial_days integer;
BEGIN
  -- Get trial period from system settings
  SELECT COALESCE(get_system_setting('trial_period_days'), '7')::integer INTO trial_days;
  
  -- Insert profile for new user with configurable trial period
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, role, is_active, trial_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'whatsapp',
    'user'::user_role,
    true,
    now() + (trial_days || ' days')::interval
  );
  
  -- Log the signup activity
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  VALUES (NEW.id, 'user_signup', 'auth', NEW.id::text);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block signup
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Add trigger for updating updated_at column
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();