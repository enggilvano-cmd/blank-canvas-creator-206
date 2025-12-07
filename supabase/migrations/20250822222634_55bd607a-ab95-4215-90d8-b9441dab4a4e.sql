-- Add trial expiration to profiles table
ALTER TABLE public.profiles 
ADD COLUMN trial_expires_at TIMESTAMP WITH TIME ZONE;

-- Update the handle_new_user function to set trial expiration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert profile for new user with 1-day trial
  INSERT INTO public.profiles (user_id, email, full_name, role, is_active, trial_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user'::user_role,
    true,
    now() + interval '1 day'  -- 1 day trial period
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

-- Create function to check if user trial is active
CREATE OR REPLACE FUNCTION public.is_trial_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(trial_expires_at > now(), false)
  FROM public.profiles 
  WHERE user_id = check_user_id 
  AND is_active = true;
$function$;

-- Create function to automatically deactivate expired trials
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
  AND role = 'user';
  
  -- Log deactivations
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  SELECT user_id, 'trial_expired', 'profile', user_id::text
  FROM public.profiles
  WHERE trial_expires_at < now() 
  AND is_active = false
  AND role = 'user';
END;
$function$;

-- Update existing users to have trial expiration (optional - for existing users)
UPDATE public.profiles 
SET trial_expires_at = created_at + interval '1 day'
WHERE trial_expires_at IS NULL AND role = 'user';