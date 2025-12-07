-- Create a default category for credit card payments
-- First check if a "Pagamento de Fatura" category exists for system use
-- This will be used for credit card payment transactions

-- Create a system category for credit card payments
INSERT INTO public.categories (name, type, color, user_id) 
SELECT 'Pagamento de Fatura', 'both', '#ef4444', profiles.user_id
FROM public.profiles
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories 
  WHERE name = 'Pagamento de Fatura' AND user_id = profiles.user_id
);