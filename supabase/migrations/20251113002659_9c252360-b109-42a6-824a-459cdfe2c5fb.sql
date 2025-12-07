-- Remove default from role column first
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

-- Drop existing type and recreate with new roles
ALTER TYPE user_role RENAME TO user_role_old;

CREATE TYPE user_role AS ENUM ('admin', 'user', 'subscriber');

-- Update profiles table to use new role type
ALTER TABLE public.profiles 
  ALTER COLUMN role TYPE user_role USING 
    CASE 
      WHEN role::text = 'admin' THEN 'admin'::user_role
      WHEN role::text = 'limited' THEN 'user'::user_role
      ELSE 'user'::user_role
    END;

-- Set new default
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user'::user_role;

-- Add subscription_expires_at column for subscriber users
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;

-- Drop old functions
DROP FUNCTION IF EXISTS public.get_user_role(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, user_role_old);

-- Drop old type (now safe)
DROP TYPE user_role_old;

-- Recreate get_user_role function with new type
CREATE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role FROM public.profiles WHERE user_id = $1;
$$;

-- Recreate has_role function with new type
CREATE FUNCTION public.has_role(check_user_id uuid, required_role user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = check_user_id 
    AND role = required_role
    AND is_active = true
  );
$$;

-- Update default role in handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Insert profile for new user as standard user (no expiration)
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'whatsapp',
    'user'::user_role,
    true
  );
  
  -- Log the signup activity
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  VALUES (NEW.id, 'user_signup', 'auth', NEW.id::text);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create function to check if subscription is active
CREATE OR REPLACE FUNCTION public.is_subscription_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN role = 'admin' THEN true
    WHEN role = 'user' THEN true
    WHEN role = 'subscriber' THEN COALESCE(subscription_expires_at > now(), false)
    ELSE false
  END
  FROM public.profiles 
  WHERE user_id = check_user_id 
  AND is_active = true;
$$;

-- Update deactivate function to handle subscribers
CREATE OR REPLACE FUNCTION public.deactivate_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET is_active = false
  WHERE subscription_expires_at < now() 
  AND is_active = true
  AND role = 'subscriber';
  
  -- Log deactivations
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  SELECT user_id, 'subscription_expired', 'profile', user_id::text
  FROM public.profiles
  WHERE subscription_expires_at < now() 
  AND is_active = false
  AND role = 'subscriber';
END;
$$;