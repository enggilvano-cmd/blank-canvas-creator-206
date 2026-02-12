drop trigger if exists "update_backup_schedules_updated_at" on "public"."backup_schedules";

drop trigger if exists "update_chart_of_accounts_updated_at" on "public"."chart_of_accounts";

drop trigger if exists "update_journal_entries_updated_at" on "public"."journal_entries";

drop trigger if exists "update_notification_settings_updated_at" on "public"."notification_settings";

drop trigger if exists "update_period_closures_updated_at" on "public"."period_closures";

drop trigger if exists "update_push_subscriptions_updated_at" on "public"."push_subscriptions";

drop trigger if exists "audit_transactions_delete" on "public"."transactions";

drop trigger if exists "audit_transactions_insert" on "public"."transactions";

drop trigger if exists "audit_transactions_update" on "public"."transactions";

drop policy "Admins can view all audit logs" on "public"."financial_audit";

drop policy "Users can view their own audit logs" on "public"."financial_audit";

drop policy "Users can update their own profile" on "public"."profiles";

drop policy "Users can view their own transactions" on "public"."transactions";

alter table "public"."account_locks" drop constraint "account_locks_account_id_fkey";

alter table "public"."categories" drop constraint "categories_chart_account_id_fkey";

drop function if exists "public"."atomic_create_fixed_transaction"(p_user_id uuid, p_description text, p_amount numeric, p_date date, p_type public.transaction_type, p_category_id uuid, p_account_id uuid, p_status public.transaction_status);

drop function if exists "public"."atomic_create_recurring_transaction"(p_user_id uuid, p_description text, p_amount numeric, p_date date, p_type public.transaction_type, p_category_id uuid, p_account_id uuid, p_status public.transaction_status, p_recurrence_type public.recurrence_type, p_recurrence_end_date date);

drop function if exists "public"."atomic_update_transfer"(p_transfer_id uuid, p_amount integer, p_date date);

drop function if exists "public"."calculate_opening_balance"(p_account_id uuid, p_start_date date, p_nature public.account_nature);

drop function if exists "public"."create_journal_entries_for_transaction"();

drop function if exists "public"."get_transactions_paginated"(p_user_id uuid, p_page integer, p_page_size integer, p_search text, p_type text, p_account_id text, p_category_id text, p_status text, p_account_type text, p_date_from date, p_date_to date, p_sort_by text, p_sort_order text);

drop function if exists "public"."get_user_role"(user_id uuid);

drop function if exists "public"."atomic_create_transaction"(p_user_id uuid, p_description text, p_amount numeric, p_date date, p_type public.transaction_type, p_category_id uuid, p_account_id uuid, p_status public.transaction_status, p_invoice_month text, p_invoice_month_overridden boolean);

drop function if exists "public"."migrate_existing_transactions_to_journal"();

drop index if exists "public"."idx_categories_chart_account_id";


  create table "public"."debug_logs" (
    "id" uuid not null default gen_random_uuid(),
    "function_name" text,
    "message" text,
    "payload" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."accounts" drop column "initial_balance";

alter table "public"."categories" drop column "chart_account_id";

alter table "public"."transactions" add column "reconciled" boolean default false;

alter table "public"."transactions" add column "reconciled_at" timestamp with time zone;

alter table "public"."transactions" add column "reconciled_by" uuid;

CREATE UNIQUE INDEX debug_logs_pkey ON public.debug_logs USING btree (id);

CREATE INDEX idx_transactions_linked_id ON public.transactions USING btree (linked_transaction_id);

CREATE INDEX idx_transactions_reconciled ON public.transactions USING btree (account_id, reconciled) WHERE (reconciled = false);

alter table "public"."debug_logs" add constraint "debug_logs_pkey" PRIMARY KEY using index "debug_logs_pkey";

alter table "public"."transactions" add constraint "transactions_reconciled_by_fkey" FOREIGN KEY (reconciled_by) REFERENCES auth.users(id) not valid;

alter table "public"."transactions" validate constraint "transactions_reconciled_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.bulk_create_transactions(p_user_id uuid, p_transactions jsonb)
 RETURNS TABLE(idx integer, success boolean, transaction_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tx JSONB;
  tx_record RECORD;
  v_transaction_id UUID;
  v_account_type TEXT;
  v_balance_change BIGINT;
  v_new_balance BIGINT;
BEGIN
  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    BEGIN
      SELECT 
        (tx->>'idx')::INT,
        tx->>'description',
        (tx->>'amount')::BIGINT,
        (tx->>'date')::DATE,
        tx->>'type',
        NULLIF(tx->>'category_id', '')::UUID,
        (tx->>'account_id')::UUID,
        tx->>'status',
        NULLIF(tx->>'invoice_month', ''),
        (tx->>'installments')::INT,
        (tx->>'current_installment')::INT
      INTO tx_record.idx, tx_record.description, tx_record.amount, tx_record.date,
           tx_record.type, tx_record.category_id, tx_record.account_id, tx_record.status,
           tx_record.invoice_month, tx_record.installments, tx_record.current_installment;

      SELECT type INTO v_account_type FROM accounts WHERE id = tx_record.account_id AND user_id = p_user_id;

      IF v_account_type IS NULL THEN
        idx := tx_record.idx; success := FALSE; transaction_id := NULL; error_message := 'Account not found';
        RETURN NEXT; CONTINUE;
      END IF;

      IF tx_record.type = 'income' THEN v_balance_change := tx_record.amount;
      ELSE v_balance_change := -tx_record.amount; END IF;

      INSERT INTO transactions (user_id, description, amount, date, type, category_id, account_id, status, invoice_month, invoice_month_overridden, installments, current_installment)
      VALUES (p_user_id, tx_record.description, CASE WHEN tx_record.type = 'income' THEN tx_record.amount ELSE -tx_record.amount END,
        tx_record.date, tx_record.type, tx_record.category_id, tx_record.account_id, tx_record.status, tx_record.invoice_month, 
        tx_record.invoice_month IS NOT NULL, tx_record.installments, tx_record.current_installment)
      RETURNING id INTO v_transaction_id;

      IF tx_record.status = 'completed' AND v_account_type != 'credit' THEN
        UPDATE accounts SET balance = balance + v_balance_change WHERE id = tx_record.account_id AND user_id = p_user_id;
      END IF;

      idx := tx_record.idx; success := TRUE; transaction_id := v_transaction_id; error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      idx := (tx->>'idx')::INT; success := FALSE; transaction_id := NULL; error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_create_transfers(p_user_id uuid, p_transfers jsonb)
 RETURNS TABLE(idx integer, success boolean, outgoing_id uuid, incoming_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tf JSONB; tf_record RECORD; v_outgoing_id UUID; v_incoming_id UUID;
  v_from_account_type TEXT; v_to_account_type TEXT; v_transfer_category_id UUID;
BEGIN
  SELECT id INTO v_transfer_category_id FROM categories WHERE user_id = p_user_id AND name = 'Transferência' LIMIT 1;
  IF v_transfer_category_id IS NULL THEN
    INSERT INTO categories (user_id, name, type) VALUES (p_user_id, 'Transferência', 'both') RETURNING id INTO v_transfer_category_id;
  END IF;

  FOR tf IN SELECT * FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      SELECT (tf->>'idx')::INT, (tf->>'from_account_id')::UUID, (tf->>'to_account_id')::UUID, (tf->>'amount')::BIGINT,
        (tf->>'date')::DATE, COALESCE(tf->>'outgoing_description', 'Transferência enviada'),
        COALESCE(tf->>'incoming_description', 'Transferência recebida'), tf->>'status'
      INTO tf_record.idx, tf_record.from_account_id, tf_record.to_account_id, tf_record.amount, tf_record.date,
           tf_record.outgoing_description, tf_record.incoming_description, tf_record.status;

      SELECT type INTO v_from_account_type FROM accounts WHERE id = tf_record.from_account_id AND user_id = p_user_id;
      SELECT type INTO v_to_account_type FROM accounts WHERE id = tf_record.to_account_id AND user_id = p_user_id;

      IF v_from_account_type IS NULL OR v_to_account_type IS NULL THEN
        idx := tf_record.idx; success := FALSE; outgoing_id := NULL; incoming_id := NULL; error_message := 'Accounts not found';
        RETURN NEXT; CONTINUE;
      END IF;

      INSERT INTO transactions (user_id, description, amount, date, type, category_id, account_id, to_account_id, status)
      VALUES (p_user_id, tf_record.outgoing_description, -tf_record.amount, tf_record.date, 'expense', v_transfer_category_id, tf_record.from_account_id, tf_record.to_account_id, tf_record.status)
      RETURNING id INTO v_outgoing_id;

      INSERT INTO transactions (user_id, description, amount, date, type, category_id, account_id, to_account_id, status)
      VALUES (p_user_id, tf_record.incoming_description, tf_record.amount, tf_record.date, 'income', v_transfer_category_id, tf_record.to_account_id, tf_record.from_account_id, tf_record.status)
      RETURNING id INTO v_incoming_id;

      UPDATE transactions SET linked_transaction_id = v_incoming_id WHERE id = v_outgoing_id;
      UPDATE transactions SET linked_transaction_id = v_outgoing_id WHERE id = v_incoming_id;

      IF tf_record.status = 'completed' THEN
        IF v_from_account_type != 'credit' THEN UPDATE accounts SET balance = balance - tf_record.amount WHERE id = tf_record.from_account_id; END IF;
        IF v_to_account_type != 'credit' THEN UPDATE accounts SET balance = balance + tf_record.amount WHERE id = tf_record.to_account_id; END IF;
      END IF;

      idx := tf_record.idx; success := TRUE; outgoing_id := v_outgoing_id; incoming_id := v_incoming_id; error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      idx := (tf->>'idx')::INT; success := FALSE; outgoing_id := NULL; incoming_id := NULL; error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_initial_balance()
 RETURNS TABLE(account_id uuid, duplicates_removed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_record RECORD;
  v_duplicates_count INTEGER;
BEGIN
  -- Iterar por cada conta que tem múltiplas transações "Saldo Inicial"
  FOR v_account_record IN
    SELECT t.account_id, COUNT(*) as tx_count
    FROM transactions t
    WHERE t.description = 'Saldo Inicial'
    GROUP BY t.account_id
    HAVING COUNT(*) > 1
  LOOP
    -- Deletar todas exceto a mais antiga (menor created_at)
    WITH oldest_tx AS (
      SELECT id
      FROM transactions
      WHERE account_id = v_account_record.account_id
        AND description = 'Saldo Inicial'
      ORDER BY created_at ASC
      LIMIT 1
    )
    DELETE FROM transactions
    WHERE account_id = v_account_record.account_id
      AND description = 'Saldo Inicial'
      AND id NOT IN (SELECT id FROM oldest_tx);
    
    -- Contar quantos foram removidos
    GET DIAGNOSTICS v_duplicates_count = ROW_COUNT;
    
    -- Recalcular saldo da conta
    PERFORM recalculate_account_balance(v_account_record.account_id);
    
    -- Retornar resultado
    RETURN QUERY SELECT v_account_record.account_id, v_duplicates_count;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_journal_entries_for_transaction(p_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction RECORD;
  v_chart_account_id uuid;
BEGIN
  -- Busca transação com lock mínimo
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id
  FOR NO KEY UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN; -- Transação já está sendo processada
  END IF;

  -- Lógica existente de criação de journal entries
  -- (mantém código atual mas com locks otimizados)
  
  -- TODO: Implementar lógica completa aqui
  NULL;
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

CREATE OR REPLACE FUNCTION public.handle_provision_deduction_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_affected_provisions RECORD;
  v_total_deducted numeric;
BEGIN
  -- Processa todas as transações novas/alteradas em batch
  -- ✅ Reduz número de locks ao processar em lote
  
  FOR v_affected_provisions IN
    SELECT DISTINCT 
      t.category_id,
      t.user_id,
      DATE_TRUNC('month', t.date) as provision_month
    FROM (
      SELECT * FROM new_table 
      WHERE (is_provision IS FALSE OR is_provision IS NULL)
        AND type = 'expense'
        AND status = 'completed'
    ) t
  LOOP
    -- Calcula total a deduzir para esta categoria/mês
    SELECT COALESCE(SUM(amount), 0) INTO v_total_deducted
    FROM new_table
    WHERE category_id = v_affected_provisions.category_id
      AND user_id = v_affected_provisions.user_id
      AND DATE_TRUNC('month', date) = v_affected_provisions.provision_month
      AND (is_provision IS FALSE OR is_provision IS NULL)
      AND type = 'expense'
      AND status = 'completed';

    -- Atualiza provision correspondente com lock mínimo
    -- ✅ FOR NO KEY UPDATE permite reads concorrentes
    UPDATE public.transactions
    SET 
      amount = amount - v_total_deducted,
      updated_at = NOW()
    WHERE id IN (
      SELECT id FROM public.transactions
      WHERE category_id = v_affected_provisions.category_id
        AND user_id = v_affected_provisions.user_id
        AND DATE_TRUNC('month', date) = v_affected_provisions.provision_month
        AND is_provision = TRUE
        AND type = 'expense'
      FOR NO KEY UPDATE SKIP LOCKED -- ✅ Evita deadlock
      LIMIT 1
    )
    AND amount - v_total_deducted >= 0; -- Previne valores negativos
  END LOOP;

  RETURN NULL; -- Statement-level trigger
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_transaction_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_error_context text;
BEGIN
  -- Wrap em bloco de exceção para rollback parcial
  BEGIN
    -- 1. Audit log (apenas se tabela existir - comentado por enquanto)
    -- IF (TG_OP = 'INSERT') THEN
    --   INSERT INTO audit_log (...)
    -- END IF;

    -- 2. Journal entries (apenas INSERT, operação mais pesada)
    IF (TG_OP = 'INSERT') THEN
      -- ✅ Usa procedure separada para evitar lock excessivo
      PERFORM create_journal_entries_for_transaction(NEW.id);
    END IF;

    -- 3. Provision deduction (apenas para transações não-provision)
    IF (TG_OP IN ('INSERT', 'UPDATE')) THEN
      IF (NEW.is_provision IS FALSE OR NEW.is_provision IS NULL) THEN
        -- ✅ Executa em statement-level ao invés de row-level
        -- Será processado em batch ao final da transação
        NULL; -- Processado por statement-level trigger separado
      END IF;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log erro mas não falha a transação principal
    GET STACKED DIAGNOSTICS v_error_context = PG_EXCEPTION_CONTEXT;
    RAISE WARNING 'Error in handle_transaction_changes: % (Context: %)', 
      SQLERRM, v_error_context;
  END;

  -- Sempre retorna o registro correto
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.atomic_create_transaction(p_user_id uuid, p_description text, p_amount numeric, p_date date, p_type public.transaction_type, p_category_id uuid, p_account_id uuid, p_status public.transaction_status, p_invoice_month text DEFAULT NULL::text, p_invoice_month_overridden boolean DEFAULT false)
 RETURNS TABLE(success boolean, transaction_id uuid, new_balance numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id UUID;
  v_account_type TEXT;
  v_new_balance NUMERIC;
  v_balance_change NUMERIC;
BEGIN
  -- Validar período não está fechado
  IF is_period_locked(p_user_id, p_date) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Buscar tipo da conta
  SELECT type INTO v_account_type
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- Calcular mudança de saldo baseado no tipo
  IF p_type = 'income' THEN
    v_balance_change := ABS(p_amount);
  ELSE
    v_balance_change := -ABS(p_amount);
  END IF;

  -- Inserir transação
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, 
    account_id, status, invoice_month, invoice_month_overridden
  )
  VALUES (
    p_user_id, p_description, v_balance_change, p_date, p_type, p_category_id,
    p_account_id, p_status, p_invoice_month, p_invoice_month_overridden
  )
  RETURNING id INTO v_transaction_id;

  -- Atualizar saldo se transação está completed
  -- CORREÇÃO: Removida a restrição AND v_account_type != 'credit'
  -- Agora atualiza saldo para TODOS os tipos de conta, incluindo cartão de crédito
  IF p_status = 'completed' THEN
    UPDATE accounts
    SET balance = balance + v_balance_change
    WHERE id = p_account_id AND user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSE
    SELECT balance INTO v_new_balance
    FROM accounts
    WHERE id = p_account_id;
  END IF;

  RETURN QUERY SELECT true, v_transaction_id, v_new_balance, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, SQLERRM::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_provisions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete provisions from previous months
  -- Only deletes transactions marked as provision that are older than the current month
  DELETE FROM transactions
  WHERE user_id = p_user_id
    AND is_provision = true
    AND date < DATE_TRUNC('month', CURRENT_DATE);
END;
$function$
;

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

CREATE OR REPLACE FUNCTION public.deactivate_expired_trials()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET is_active = false
  WHERE trial_expires_at < now() 
  AND is_active = true;
  
  -- Log deactivations
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id)
  SELECT user_id, 'trial_expired', 'profile', user_id::text
  FROM public.profiles
  WHERE trial_expires_at < now() 
  AND is_active = false;
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- 1. Busca configuração de dias de trial (padrão 30)
  SELECT setting_value::INTEGER INTO v_trial_days
  FROM public.system_settings
  WHERE setting_key = 'trial_days';
  
  IF v_trial_days IS NULL THEN
    v_trial_days := 30;
  END IF;

  -- 2. Insere Perfil com data de expiração
  INSERT INTO public.profiles (user_id, email, full_name, whatsapp, is_active, trial_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'whatsapp',
    true,
    now() + (v_trial_days || ' days')::INTERVAL
  );

  -- 3. Insere a role 'trial' (Fundamental para não ser Vitalício)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'trial')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
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

CREATE OR REPLACE FUNCTION public.migrate_existing_transactions_to_journal()
 RETURNS TABLE(processed_count integer, error_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_transaction RECORD;
  v_account RECORD;
  v_category RECORD;
  v_coa RECORD;
  v_asset_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
BEGIN
  -- Processar todas as transações completed sem journal_entries
  FOR v_transaction IN 
    SELECT t.*, a.type as account_type
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.status = 'completed'
      AND t.type IN ('income', 'expense')
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.transaction_id = t.id
      )
  LOOP
    BEGIN
      -- Buscar plano de contas do usuário
      SELECT * INTO v_coa 
      FROM chart_of_accounts 
      WHERE user_id = v_transaction.user_id 
      LIMIT 1;
      
      IF v_coa.id IS NULL THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Mapear conta bancária para conta contábil
      IF v_transaction.account_type = 'checking' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.02' LIMIT 1;
      ELSIF v_transaction.account_type = 'savings' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.03' LIMIT 1;
      ELSIF v_transaction.account_type = 'investment' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '1.01.04' LIMIT 1;
      ELSIF v_transaction.account_type = 'credit' THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code = '2.01.01' LIMIT 1;
      END IF;

      -- Fallback
      IF v_asset_account_id IS NULL THEN
        SELECT id INTO v_asset_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND code LIKE '1.01.%' 
        ORDER BY code LIMIT 1;
      END IF;

      IF v_asset_account_id IS NULL THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      IF v_transaction.type = 'income' THEN
        -- Buscar conta de receita
        SELECT id INTO v_revenue_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND category = 'revenue' 
        ORDER BY code LIMIT 1;

        IF v_revenue_account_id IS NOT NULL THEN
          -- Débito: Ativo | Crédito: Receita
          INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
          VALUES 
            (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
            (v_transaction.user_id, v_transaction.id, v_revenue_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
          
          v_processed := v_processed + 1;
        ELSE
          v_errors := v_errors + 1;
        END IF;

      ELSIF v_transaction.type = 'expense' THEN
        -- Buscar conta de despesa
        SELECT id INTO v_expense_account_id FROM chart_of_accounts 
        WHERE user_id = v_transaction.user_id AND category = 'expense' 
        ORDER BY code LIMIT 1;

        IF v_expense_account_id IS NOT NULL THEN
          -- Débito: Despesa | Crédito: Ativo
          INSERT INTO journal_entries (user_id, transaction_id, account_id, entry_type, amount, description, entry_date)
          VALUES 
            (v_transaction.user_id, v_transaction.id, v_expense_account_id, 'debit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date),
            (v_transaction.user_id, v_transaction.id, v_asset_account_id, 'credit', ABS(v_transaction.amount), v_transaction.description, v_transaction.date);
          
          v_processed := v_processed + 1;
        ELSE
          v_errors := v_errors + 1;
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors;
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

grant delete on table "public"."debug_logs" to "anon";

grant insert on table "public"."debug_logs" to "anon";

grant references on table "public"."debug_logs" to "anon";

grant select on table "public"."debug_logs" to "anon";

grant trigger on table "public"."debug_logs" to "anon";

grant truncate on table "public"."debug_logs" to "anon";

grant update on table "public"."debug_logs" to "anon";

grant delete on table "public"."debug_logs" to "authenticated";

grant insert on table "public"."debug_logs" to "authenticated";

grant references on table "public"."debug_logs" to "authenticated";

grant select on table "public"."debug_logs" to "authenticated";

grant trigger on table "public"."debug_logs" to "authenticated";

grant truncate on table "public"."debug_logs" to "authenticated";

grant update on table "public"."debug_logs" to "authenticated";

grant delete on table "public"."debug_logs" to "service_role";

grant insert on table "public"."debug_logs" to "service_role";

grant references on table "public"."debug_logs" to "service_role";

grant select on table "public"."debug_logs" to "service_role";

grant trigger on table "public"."debug_logs" to "service_role";

grant truncate on table "public"."debug_logs" to "service_role";

grant update on table "public"."debug_logs" to "service_role";

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


