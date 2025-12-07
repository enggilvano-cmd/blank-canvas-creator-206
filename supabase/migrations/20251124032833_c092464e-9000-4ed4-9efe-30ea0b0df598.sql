-- Fix foreign key constraint on financial_audit to allow user deletion
-- The created_by field should be set to NULL when a user is deleted (to preserve audit history)

ALTER TABLE public.financial_audit 
DROP CONSTRAINT IF EXISTS financial_audit_created_by_fkey;

ALTER TABLE public.financial_audit
ADD CONSTRAINT financial_audit_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;