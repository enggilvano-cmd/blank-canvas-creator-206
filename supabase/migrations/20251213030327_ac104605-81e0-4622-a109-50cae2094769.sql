-- Add missing SELECT policy for accounts table
CREATE POLICY "Users can view their own accounts" 
ON public.accounts 
FOR SELECT 
USING (auth.uid() = user_id);

-- Add missing SELECT policy for categories table
CREATE POLICY "Users can view their own categories" 
ON public.categories 
FOR SELECT 
USING (auth.uid() = user_id);

-- Add missing SELECT policy for backup_schedules table
CREATE POLICY "Users can view their own backup schedules" 
ON public.backup_schedules 
FOR SELECT 
USING (auth.uid() = user_id);

-- Add missing SELECT and UPDATE policies for user_settings table
CREATE POLICY "Users can view their own settings" 
ON public.user_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON public.user_settings 
FOR UPDATE 
USING (auth.uid() = user_id);