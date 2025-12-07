-- =========================================================================
-- CRITICAL SECURITY FIX: Migrate roles from profiles to user_roles table
-- =========================================================================
-- This migration addresses the privilege escalation vulnerability by:
-- 1. Ensuring user_roles table is properly populated
-- 2. Updating SECURITY DEFINER functions to use user_roles exclusively
-- 3. Removing role column from profiles table
-- 
-- IMPORTANT: We maintain original parameter names to avoid breaking RLS policies
-- =========================================================================

-- Step 1: Migrate all existing roles from profiles to user_roles
-- (if not already migrated)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, role
FROM public.profiles
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 2: Update has_role() to use ONLY user_roles table
-- IMPORTANT: Keep original parameter names (check_user_id, required_role)
CREATE OR REPLACE FUNCTION public.has_role(check_user_id uuid, required_role user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles
    WHERE user_id = check_user_id 
      AND role = required_role
  );
$$;

-- Step 3: Update is_admin() to use has_role()
-- IMPORTANT: Keep original parameter name (check_user_id)
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(check_user_id, 'admin'::public.user_role);
$$;

-- Step 4: Update get_user_role() to query user_roles table
-- IMPORTANT: Keep original parameter name (user_id) - this function signature is fine
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = $1
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'subscriber' THEN 2
      WHEN 'user' THEN 3
      WHEN 'trial' THEN 4
    END
  LIMIT 1;
$$;

-- Step 5: Create helper function to get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(check_user_id uuid)
RETURNS TABLE(role user_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = check_user_id;
$$;

-- Step 6: Update is_subscription_active to use user_roles
CREATE OR REPLACE FUNCTION public.is_subscription_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN public.has_role(check_user_id, 'admin') THEN true
    WHEN public.has_role(check_user_id, 'user') THEN true
    WHEN public.has_role(check_user_id, 'trial') THEN 
      COALESCE((SELECT trial_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true), false)
    WHEN public.has_role(check_user_id, 'subscriber') THEN 
      COALESCE((SELECT subscription_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true), false)
    ELSE false
  END;
$$;

-- Step 7: Update is_trial_active to use user_roles
CREATE OR REPLACE FUNCTION public.is_trial_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(check_user_id, 'trial') 
    AND COALESCE(
      (SELECT trial_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true),
      false
    );
$$;

-- Step 8: Update handle_new_user trigger to insert into user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert profile without role (role column will be removed)
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'whatsapp',
    true
  );

  -- Insert default 'user' role into user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Step 9: Remove role column from profiles table
-- CRITICAL: This is done AFTER all functions are updated
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Step 10: Add comments documenting the security fix
COMMENT ON TABLE public.user_roles IS 'Stores user roles in a dedicated table (security best practice - prevents privilege escalation via profiles table compromise)';
COMMENT ON FUNCTION public.has_role IS 'SECURITY DEFINER function to check user roles - queries user_roles table exclusively';
COMMENT ON FUNCTION public.is_admin IS 'SECURITY DEFINER function to check admin status - uses has_role() to query user_roles table';
COMMENT ON FUNCTION public.get_user_role IS 'SECURITY DEFINER function to get primary user role - queries user_roles table exclusively';