-- Add whatsapp column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN whatsapp TEXT;

-- Update the handle_new_user function to also save whatsapp from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert profile for new user with 1-day trial and whatsapp
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, role, is_active, trial_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'whatsapp',
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