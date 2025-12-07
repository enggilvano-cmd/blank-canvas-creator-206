-- Fix RLS policies for proper data saving functionality

-- Allow users to insert their own profile during signup
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" 
ON profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- [CORREÇÃO]: A política "Users can view all profiles"
-- que existia aqui foi REMOVIDA. Ela criava uma falha de segurança
-- grave. As políticas corretas de visualização (próprio usuário e admin)
-- já existem na migração 20250820071704_636dea78-7ec2-4e8a-8c21-6d626646ed4c.sql

-- Ensure audit_logs can be inserted by authenticated users
DROP POLICY IF EXISTS "Users can insert audit logs" ON audit_logs;
CREATE POLICY "Users can insert audit logs" 
ON audit_logs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix the handle_new_user function to ensure it works correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert profile for new user
  INSERT INTO public.profiles (user_id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user'::user_role,
    true
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
$$;