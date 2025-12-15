-- Documentação para atomic_create_transfer
COMMENT ON FUNCTION public.atomic_create_transfer IS 
'🔐 SECURITY DEFINER: Cria transferência entre contas com validação de user_id.
BUG FIX #4: Impede que usuários façam transferências de contas de outros.
Transação atômica: débito e crédito simultaneamente.';
