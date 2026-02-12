set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.deactivate_expired_subscriptions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET is_active = false
  WHERE subscription_expires_at < now() 
  AND is_active = true
  AND role = 'subscriber';
  
  -- Log deactivations
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  SELECT user_id, 'subscription_expired', 'profile', user_id::text
  FROM public.profiles
  WHERE subscription_expires_at < now() 
  AND is_active = false
  AND role = 'subscriber';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_transactions_totals(p_user_id uuid, p_type text DEFAULT 'all'::text, p_status text DEFAULT 'all'::text, p_account_type text DEFAULT 'all'::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_invoice_month text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_is_fixed boolean DEFAULT NULL::boolean, p_is_provision boolean DEFAULT NULL::boolean)
 RETURNS TABLE(total_income numeric, total_expenses numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN t.type = 'income' AND t.type != 'transfer' THEN t.amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.type != 'transfer' THEN t.amount ELSE 0 END), 0) as total_expenses,
    COALESCE(SUM(CASE 
      WHEN t.type = 'income' AND t.type != 'transfer' THEN t.amount 
      WHEN t.type = 'expense' AND t.type != 'transfer' THEN -t.amount 
      ELSE 0 
    END), 0) as balance
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  WHERE t.user_id = p_user_id
    AND (p_type = 'all' OR t.type::text = p_type)
    AND (p_status = 'all' OR t.status::text = p_status)
    AND (p_account_type = 'all' OR a.type::text = p_account_type)
    AND (p_date_from IS NULL OR t.date >= p_date_from::date)
    AND (p_date_to IS NULL OR t.date <= p_date_to::date)
    AND (p_account_id IS NULL OR t.account_id = p_account_id)
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_invoice_month IS NULL OR t.invoice_month = p_invoice_month)
    AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%')
    AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id uuid)
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
            SELECT role FROM public.user_roles WHERE user_id = check_user_id LIMIT 1;
          $function$
;

CREATE OR REPLACE FUNCTION public.has_role(check_user_id uuid, required_role public.user_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
            SELECT EXISTS (
              SELECT 1 FROM public.user_roles
              WHERE user_id = check_user_id AND role = required_role
            );
          $function$
;

CREATE OR REPLACE FUNCTION public.log_user_activity(p_user_id uuid, p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, resource_type, resource_id, old_values, new_values
  ) VALUES (
    p_user_id, p_action, p_resource_type, p_resource_id, p_old_values, p_new_values
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_notification_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_period_entries(p_user_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(is_valid boolean, unbalanced_count integer, missing_entries_count integer, total_transactions integer, error_details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_transactions INTEGER := 0;
  v_unbalanced_count INTEGER := 0;
  v_missing_entries_count INTEGER := 0;
  v_error_details JSONB := '[]'::jsonb;
  v_transaction RECORD;
BEGIN
  -- Contar total de transações completed no período
  SELECT COUNT(*)
  INTO v_total_transactions
  FROM transactions
  WHERE user_id = p_user_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'completed'
    AND type IN ('income', 'expense');

  -- Verificar cada transação
  FOR v_transaction IN 
    SELECT 
      t.id,
      t.description,
      t.date,
      t.type,
      t.amount
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.date >= p_start_date
      AND t.date <= p_end_date
      AND t.status = 'completed'
      AND t.type IN ('income', 'expense')
  LOOP
    -- Verificar se tem journal entries
    DECLARE
      v_has_entries BOOLEAN;
      v_is_balanced BOOLEAN;
      v_debit_total NUMERIC;
      v_credit_total NUMERIC;
    BEGIN
      -- Verificar existência de journal entries
      SELECT EXISTS(
        SELECT 1 FROM journal_entries 
        WHERE transaction_id = v_transaction.id
      ) INTO v_has_entries;

      IF NOT v_has_entries THEN
        -- Transação sem journal entries
        v_missing_entries_count := v_missing_entries_count + 1;
        v_error_details := v_error_details || jsonb_build_object(
          'transaction_id', v_transaction.id,
          'description', v_transaction.description,
          'date', v_transaction.date,
          'type', v_transaction.type,
          'error', 'Missing journal entries'
        );
      ELSE
        -- Verificar balanceamento
        SELECT 
          COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
        INTO v_debit_total, v_credit_total
        FROM journal_entries
        WHERE transaction_id = v_transaction.id;

        v_is_balanced := ABS(v_debit_total - v_credit_total) < 0.01;

        IF NOT v_is_balanced THEN
          -- Journal entries não balanceadas
          v_unbalanced_count := v_unbalanced_count + 1;
          v_error_details := v_error_details || jsonb_build_object(
            'transaction_id', v_transaction.id,
            'description', v_transaction.description,
            'date', v_transaction.date,
            'type', v_transaction.type,
            'error', 'Unbalanced entries',
            'debits', v_debit_total,
            'credits', v_credit_total,
            'difference', v_debit_total - v_credit_total
          );
        END IF;
      END IF;
    END;
  END LOOP;

  -- Retornar resultado
  RETURN QUERY SELECT
    (v_unbalanced_count = 0 AND v_missing_entries_count = 0) AS is_valid,
    v_unbalanced_count,
    v_missing_entries_count,
    v_total_transactions,
    v_error_details;
END;
$function$
;

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


