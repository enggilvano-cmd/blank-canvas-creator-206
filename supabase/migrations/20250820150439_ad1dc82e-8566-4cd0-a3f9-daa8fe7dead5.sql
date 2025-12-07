-- Remove the overly permissive policy that allows all authenticated users to view all profiles
-- This policy exposed email addresses to all users, creating a security vulnerability
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Keep the existing policies that are security-appropriate:
-- 1. "Users can view their own profile" - allows users to see only their own data  
-- 2. "Admins can view all profiles" - allows admins to manage users
-- 3. Other user-specific policies for insert/update operations

-- Add a comment to document the security fix
COMMENT ON TABLE public.profiles IS 'User profiles table - RLS policies ensure users can only view their own profile, except admins who can view all profiles for management purposes';