-- Documentação para atomic_delete_transaction
COMMENT ON FUNCTION public.atomic_delete_transaction IS 
'🔐 SECURITY DEFINER: Deleta transações com validação de user_id.
BUG FIX #4: Impede que usuários deletem transações de outros.
Parâmetros:
  - p_user_id: ID do usuário (validado contra auth.uid())
  - p_transaction_id: Transação a deletar
  - p_scope: "current" (só esta), "current-and-remaining" (futuras), "all" (série inteira)';

