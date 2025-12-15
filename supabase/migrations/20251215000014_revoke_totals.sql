-- Configurar permissões para get_transactions_totals
REVOKE ALL ON FUNCTION public.get_transactions_totals(uuid, text, text, text, text, text, boolean, boolean, date, date, text) FROM PUBLIC;

