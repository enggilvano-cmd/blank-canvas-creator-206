-- Documentação para get_transactions_totals
COMMENT ON FUNCTION public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean, date, date, text) IS 
'🔐 SECURITY DEFINER: Retorna totais de transações com validação de user_id.
BUG FIX #4: Impede que usuários vejam totais de outros usuários.
Parâmetros suportam múltiplos filtros: contas, categorias, datas, tipos.';

