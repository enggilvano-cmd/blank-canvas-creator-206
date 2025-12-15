-- Conceder permissão authenticated para get_transactions_totals
GRANT EXECUTE ON FUNCTION public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean, date, date, text) TO authenticated;


