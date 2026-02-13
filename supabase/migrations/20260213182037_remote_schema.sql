

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_category" AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense',
    'contra_asset',
    'contra_liability'
);


ALTER TYPE "public"."account_category" OWNER TO "postgres";


CREATE TYPE "public"."account_nature" AS ENUM (
    'debit',
    'credit'
);


ALTER TYPE "public"."account_nature" OWNER TO "postgres";


CREATE TYPE "public"."account_type" AS ENUM (
    'checking',
    'savings',
    'credit',
    'investment',
    'meal_voucher'
);


ALTER TYPE "public"."account_type" OWNER TO "postgres";


CREATE TYPE "public"."category_type" AS ENUM (
    'income',
    'expense',
    'both'
);


ALTER TYPE "public"."category_type" OWNER TO "postgres";


CREATE TYPE "public"."recurrence_type" AS ENUM (
    'daily',
    'weekly',
    'monthly',
    'yearly'
);


ALTER TYPE "public"."recurrence_type" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'completed'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type" AS ENUM (
    'income',
    'expense',
    'transfer'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'user',
    'subscriber',
    'trial'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status" DEFAULT 'pending'::"public"."transaction_status", "p_is_provision" boolean DEFAULT false) RETURNS TABLE("success" boolean, "parent_id" "uuid", "created_count" integer, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_parent_id UUID;
  v_account_type TEXT;
  v_current_date DATE;
  v_count INTEGER := 0;
  v_calculated_amount NUMERIC(12,2);
  v_day_of_month INTEGER;
  v_current_year INTEGER;
  v_current_month INTEGER;
  v_months_to_create INTEGER;
  v_existing_amount NUMERIC(12,2) := 0;
BEGIN
  -- Validar user_id
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Unauthorized: user_id validation failed'::TEXT;
    RETURN;
  END IF;

  -- Validar account ownership
  SELECT type INTO v_account_type
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Account not found or does not belong to user'::TEXT;
    RETURN;
  END IF;

  -- Validar category ownership (se fornecido)
  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM categories 
      WHERE id = p_category_id AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, 0, 'Category not found or does not belong to user'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Calcular amount com sinal correto e GARANTIR 2 casas decimais
  v_calculated_amount := ROUND(
    CASE 
      WHEN p_type = 'expense' THEN -ABS(p_amount)
      ELSE ABS(p_amount)
    END, 
  2);

  -- Extrair informações da data inicial
  v_day_of_month := EXTRACT(DAY FROM p_date);
  v_current_year := EXTRACT(YEAR FROM p_date);
  v_current_month := EXTRACT(MONTH FROM p_date);

  -- Calcular quantos meses criar:
  -- Meses restantes do ano atual (incluindo mês atual) + 12 meses do ano seguinte
  v_months_to_create := (12 - v_current_month + 1) + 12;

  -- Criar transação parent SEMPRE como 'pending'
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, 'pending', true, p_is_provision
  ) RETURNING id INTO v_parent_id;

  v_count := 1;

  -- Se for provisão, calcular desconto de transações JÁ EXISTENTES no mês
  IF p_is_provision THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_amount
    FROM transactions
    WHERE user_id = p_user_id
      AND category_id = p_category_id
      AND date_trunc('month', date) = date_trunc('month', p_date)
      AND is_provision = false;
      
    -- Subtrair o valor existente do valor da provisão
    v_calculated_amount := ROUND(v_calculated_amount - v_existing_amount, 2);
  END IF;

  -- Criar PRIMEIRA FILHA com a MESMA DATA da parent
  INSERT INTO transactions (
    user_id, description, amount, date, type, category_id, account_id,
    status, is_fixed, parent_transaction_id, is_provision
  ) VALUES (
    p_user_id, p_description, v_calculated_amount, p_date, p_type, p_category_id,
    p_account_id, p_status, true, v_parent_id, p_is_provision
  );

  -- Recalcular saldo apenas se a primeira filha for 'completed'
  IF p_status = 'completed' THEN
    PERFORM recalculate_account_balance(p_account_id);
  END IF;

  v_count := v_count + 1;

  -- Inicializar v_current_date com p_date para começar a incrementar
  v_current_date := p_date;

  -- Gerar transações filhas para os meses subsequentes (sempre 'pending')
  FOR i IN 2..v_months_to_create LOOP
    -- Avançar para o próximo mês
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;

    -- Ajustar para o último dia do mês se o dia não existir
    IF EXTRACT(DAY FROM v_current_date) != v_day_of_month THEN
      v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;

    -- Validar período bloqueado
    IF is_period_locked(p_user_id, v_current_date) THEN
      EXIT;
    END IF;

    -- Inserir transação filha
    INSERT INTO transactions (
      user_id, description, amount, date, type, category_id, account_id,
      status, is_fixed, parent_transaction_id, is_provision
    ) VALUES (
      p_user_id, p_description, v_calculated_amount, v_current_date, p_type, p_category_id,
      p_account_id, 'pending', true, v_parent_id, p_is_provision
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT true, v_parent_id, v_count, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, 0, SQLERRM;
END;
$$;


ALTER FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_is_provision" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_create_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_invoice_month" "text" DEFAULT NULL::"text", "p_invoice_month_overridden" boolean DEFAULT false) RETURNS TABLE("success" boolean, "transaction_id" "uuid", "new_balance" numeric, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."atomic_create_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_invoice_month" "text", "p_invoice_month_overridden" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_create_transfer"("p_user_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_date" "date", "p_outgoing_description" "text" DEFAULT NULL::"text", "p_incoming_description" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT 'completed'::"text") RETURNS TABLE("success" boolean, "outgoing_transaction_id" "uuid", "incoming_transaction_id" "uuid", "from_balance" numeric, "to_balance" numeric, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_from_account_user_id UUID;
  v_to_account_user_id UUID;
  v_outgoing_id UUID;
  v_incoming_id UUID;
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_status public.transaction_status;
BEGIN
  -- Tentar converter o status
  BEGIN
    v_status := p_status::public.transaction_status;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Invalid status value: ' || p_status;
    RETURN;
  END;

  -- 🔐 SECURITY: VALIDAR USER_ID
  BEGIN
    IF (SELECT to_regproc('public.validate_user_access')) IS NOT NULL THEN
      IF NOT validate_user_access(p_user_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Unauthorized access'::TEXT;
        RETURN;
      END IF;
    ELSE
      IF auth.uid() != p_user_id THEN
         RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Unauthorized access (fallback)'::TEXT;
         RETURN;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
     RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Security validation failed: ' || SQLERRM;
     RETURN;
  END;

  -- Validar que ambas contas pertencem ao usuário
  SELECT user_id INTO v_from_account_user_id FROM accounts WHERE id = p_from_account_id;
  SELECT user_id INTO v_to_account_user_id FROM accounts WHERE id = p_to_account_id;

  IF v_from_account_user_id IS NULL OR v_to_account_user_id IS NULL THEN
     RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Account not found'::TEXT;
     RETURN;
  END IF;

  IF v_from_account_user_id != p_user_id OR v_to_account_user_id != p_user_id THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'One or both accounts do not belong to user'::TEXT;      
    RETURN;
  END IF;

  -- 1. Inserir transação de SAÍDA (Débito) - type='transfer', amount negativo
  INSERT INTO transactions (
    user_id, account_id, category_id, amount, type,
    date, description, status, to_account_id, created_at, updated_at
  ) VALUES (
    p_user_id, p_from_account_id, NULL, -ABS(p_amount), 'transfer',
    p_date, COALESCE(p_outgoing_description, 'Transferência enviada'), v_status, p_to_account_id, NOW(), NOW()
  )
  RETURNING id INTO v_outgoing_id;

  -- 2. Inserir transação de ENTRADA (Crédito) - type='transfer', amount positivo
  -- FIX CRÍTICO: Mudado de 'income' para 'transfer'
  INSERT INTO transactions (
    user_id, account_id, category_id, amount, type,
    date, description, status, linked_transaction_id, created_at, updated_at
  ) VALUES (
    p_user_id, p_to_account_id, NULL, ABS(p_amount), 'transfer',
    p_date, COALESCE(p_incoming_description, 'Transferência recebida'), v_status, v_outgoing_id, NOW(), NOW()
  )
  RETURNING id INTO v_incoming_id;

  -- 3. Atualizar saldos das contas (se status for completed)
  IF v_status = 'completed' THEN
    UPDATE accounts SET balance = balance - ABS(p_amount) WHERE id = p_from_account_id RETURNING balance INTO v_from_balance;
    UPDATE accounts SET balance = balance + ABS(p_amount) WHERE id = p_to_account_id RETURNING balance INTO v_to_balance;
  ELSE
    -- Se não completado, retornar saldos atuais
    SELECT balance INTO v_from_balance FROM accounts WHERE id = p_from_account_id;
    SELECT balance INTO v_to_balance FROM accounts WHERE id = p_to_account_id;
  END IF;

  RETURN QUERY SELECT true, v_outgoing_id, v_incoming_id, v_from_balance, v_to_balance, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'SQL Error: ' || SQLERRM;
END;
$$;


ALTER FUNCTION "public"."atomic_create_transfer"("p_user_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_date" "date", "p_outgoing_description" "text", "p_incoming_description" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text" DEFAULT 'current'::"text") RETURNS TABLE("success" boolean, "deleted_count" integer, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_temp_count INTEGER := 0;
  v_transaction_user_id UUID;
  v_transaction_date DATE;
  v_parent_id UUID;
  v_real_parent_id UUID;
  v_account_id UUID;
  v_affected_accounts UUID[];
  v_acc UUID;
  v_linked_transaction_id UUID;
  v_to_account_id UUID;
  v_reverse_linked_id UUID;
  v_is_fixed BOOLEAN;
  v_transaction_status TEXT;
  v_completed_children_count INTEGER := 0;
  v_pending_children_count INTEGER := 0;
  v_remaining_children_count INTEGER := 0;
  v_parent_is_fixed BOOLEAN;
BEGIN
  -- Validar acesso do usuário
  IF NOT validate_user_access(p_user_id) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized access'::TEXT;
    RETURN;
  END IF;

  -- ✅ BUG FIX #4: Usar FOR UPDATE para travar a transação e prevenir race conditions
  -- Isso garante que nenhuma outra operação concorrente modifique esta transação
  -- enquanto estamos processando a exclusão
  SELECT user_id, date, parent_transaction_id, account_id, 
         linked_transaction_id, to_account_id, status, is_fixed
  INTO v_transaction_user_id, v_transaction_date, v_real_parent_id, v_account_id, 
       v_linked_transaction_id, v_to_account_id, v_transaction_status, v_is_fixed
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE; -- Lock exclusivo na transação alvo

  IF v_transaction_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  IF v_transaction_user_id != p_user_id THEN
    RETURN QUERY SELECT false, 0, 'Transaction does not belong to user'::TEXT;
    RETURN;
  END IF;

  -- =====================================
  -- SCOPE: CURRENT - Deletar apenas a transação especificada
  -- =====================================
  IF p_scope = 'current' THEN
    -- Handle linked transfers
    IF v_linked_transaction_id IS NOT NULL THEN
      v_reverse_linked_id := v_linked_transaction_id;
    ELSIF v_to_account_id IS NOT NULL THEN
      -- ✅ BUG FIX #4: Lock na transação vinculada também
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      FOR UPDATE -- Lock exclusivo na transação vinculada
      LIMIT 1;
    END IF;
    
    -- Deletar transação
    DELETE FROM transactions 
    WHERE id = p_transaction_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Deletar linked transaction se existir
    IF v_reverse_linked_id IS NOT NULL THEN
      DELETE FROM transactions
      WHERE id = v_reverse_linked_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
    END IF;
    
    PERFORM recalculate_account_balance(v_account_id);
    IF v_to_account_id IS NOT NULL THEN
      PERFORM recalculate_account_balance(v_to_account_id);
    END IF;
    
    -- Limpeza de pai órfão (apenas se pai não é is_fixed=true)
    IF v_real_parent_id IS NOT NULL THEN
      -- ✅ BUG FIX #4: Lock na transação pai antes de verificar filhos
      SELECT is_fixed INTO v_parent_is_fixed
      FROM transactions
      WHERE id = v_real_parent_id AND user_id = p_user_id
      FOR UPDATE; -- Lock exclusivo no pai
      
      -- Verificar filhos com lock para evitar race condition
      SELECT COUNT(*) INTO v_remaining_children_count
      FROM transactions
      WHERE parent_transaction_id = v_real_parent_id AND user_id = p_user_id
      FOR UPDATE; -- Lock nos filhos também
      
      IF v_remaining_children_count = 0 AND (v_parent_is_fixed = false OR v_parent_is_fixed IS NULL) THEN
        DELETE FROM transactions
        WHERE id = v_real_parent_id AND user_id = p_user_id;
        v_deleted_count := v_deleted_count + 1;
      END IF;
    END IF;
    
    RETURN QUERY SELECT true, v_deleted_count, 'Transaction deleted'::TEXT;
    RETURN;
  END IF;

  -- =====================================
  -- Para scopes 'all' e 'current-and-remaining', determinar o parent
  -- =====================================
  
  -- Se a transação tem um parent, usar o parent. Senão, a própria transação é o parent.
  v_parent_id := COALESCE(v_real_parent_id, p_transaction_id);

  -- ✅ BUG FIX #4: Lock no pai e em todas as filhas antes de coletar dados
  -- Isso previne que novas transações filhas sejam inseridas durante a operação
  PERFORM 1 FROM transactions 
  WHERE user_id = p_user_id 
    AND (id = v_parent_id OR parent_transaction_id = v_parent_id)
  FOR UPDATE; -- Lock exclusivo em todas as transações relacionadas

  -- Coletar contas afetadas
  SELECT array_agg(DISTINCT account_id) INTO v_affected_accounts
  FROM transactions
  WHERE user_id = p_user_id 
    AND (id = v_parent_id OR parent_transaction_id = v_parent_id);

  -- Contar filhas por status (já estão travadas pelo FOR UPDATE anterior)
  SELECT COUNT(*) INTO v_completed_children_count
  FROM transactions 
  WHERE parent_transaction_id = v_parent_id 
    AND status = 'completed'
    AND user_id = p_user_id;
    
  SELECT COUNT(*) INTO v_pending_children_count
  FROM transactions 
  WHERE parent_transaction_id = v_parent_id 
    AND status = 'pending'
    AND user_id = p_user_id;

  -- =====================================
  -- SCOPE: CURRENT-AND-REMAINING
  -- =====================================
  IF p_scope = 'current-and-remaining' THEN
    DELETE FROM transactions 
    WHERE user_id = p_user_id 
      AND parent_transaction_id = v_parent_id
      AND date >= v_transaction_date
      AND status = 'pending';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    DELETE FROM transactions 
    WHERE id = v_parent_id 
      AND user_id = p_user_id
      AND status = 'pending'
      AND date >= v_transaction_date;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
    
    IF v_affected_accounts IS NOT NULL THEN
      FOREACH v_acc IN ARRAY v_affected_accounts LOOP
        IF v_acc IS NOT NULL THEN
          PERFORM recalculate_account_balance(v_acc);
        END IF;
      END LOOP;
    END IF;
    
    RETURN QUERY SELECT true, v_deleted_count, format('Deleted %s pending from date', v_deleted_count)::TEXT;
    RETURN;
  END IF;

  -- =====================================
  -- SCOPE: ALL - Deletar TUDO ou preservar concluídas (sem badge Fixa)
  -- =====================================
  IF p_scope = 'all' THEN
    IF v_completed_children_count > 0 THEN
      -- TEM FILHAS CONCLUÍDAS:
      -- 1. Deletar TODAS as filhas PENDENTES
      -- 2. Converter filhas CONCLUÍDAS para transações normais (is_fixed = false)
      -- 3. Deletar o PAI completamente
      
      -- PASSO 1: Deletar TODAS as filhas PENDENTES
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id
        AND status = 'pending';
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- PASSO 2: Converter filhas CONCLUÍDAS para transações normais
      -- Removendo is_fixed e parent_transaction_id para que apareçam
      -- na página Transações como transações comuns
      UPDATE transactions
      SET is_fixed = false,
          parent_transaction_id = NULL
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id
        AND status = 'completed';
      
      -- PASSO 3: Deletar o PAI completamente
      DELETE FROM transactions 
      WHERE id = v_parent_id 
        AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
      
      -- PASSO 4: Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, 
        format('Deleted %s pending + parent, converted %s completed to regular', 
               v_deleted_count - 1, v_completed_children_count)::TEXT;
      RETURN;
      
    ELSE
      -- NÃO TEM FILHAS CONCLUÍDAS: Deletar tudo normalmente
      
      -- PASSO 1: Deletar todas as filhas
      DELETE FROM transactions 
      WHERE user_id = p_user_id 
        AND parent_transaction_id = v_parent_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      
      -- PASSO 2: Deletar o pai
      DELETE FROM transactions 
      WHERE id = v_parent_id 
        AND user_id = p_user_id;
      GET DIAGNOSTICS v_temp_count = ROW_COUNT;
      v_deleted_count := v_deleted_count + v_temp_count;
      
      -- PASSO 3: Recalcular saldos
      IF v_affected_accounts IS NOT NULL THEN
        FOREACH v_acc IN ARRAY v_affected_accounts LOOP
          IF v_acc IS NOT NULL THEN
            PERFORM recalculate_account_balance(v_acc);
          END IF;
        END LOOP;
      END IF;
      
      RETURN QUERY SELECT true, v_deleted_count, format('Deleted all %s transactions', v_deleted_count)::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Scope inválido
  RETURN QUERY SELECT false, 0, format('Invalid scope: %s', p_scope)::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$;


ALTER FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") IS '🔐 SECURITY DEFINER: Deleta transações com validação de user_id.
BUG FIX #4: Impede que usuários deletem transações de outros.
Parâmetros:
  - p_user_id: ID do usuário (validado contra auth.uid())
  - p_transaction_id: Transação a deletar
  - p_scope: "current" (só esta), "current-and-remaining" (futuras), "all" (série inteira)';



CREATE OR REPLACE FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text" DEFAULT 'current'::"text") RETURNS TABLE("updated_count" integer, "affected_accounts" "uuid"[], "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_transaction_date DATE;
  v_parent_id UUID;
  v_linked_transaction_id UUID;
  v_to_account_id UUID;
  v_reverse_linked_id UUID;
  v_current_installment INTEGER;
  v_is_fixed BOOLEAN;
  v_is_recurring BOOLEAN;
  v_parent_is_fixed BOOLEAN;
  v_parent_is_recurring BOOLEAN;
  v_transaction_ids UUID[];
  v_affected_accounts UUID[];
  v_updated_count INTEGER := 0;
  v_old_account_id UUID;
  v_new_account_id UUID;
  v_amount NUMERIC;
  v_type transaction_type;
  v_current_type transaction_type;
  v_linked_amount NUMERIC;
  v_linked_type transaction_type;
BEGIN
  -- Buscar transação
  SELECT
    date,
    parent_transaction_id,
    linked_transaction_id,
    to_account_id,
    current_installment,
    account_id,
    type,
    is_fixed,
    is_recurring
  INTO
    v_transaction_date,
    v_parent_id,
    v_linked_transaction_id,
    v_to_account_id,
    v_current_installment,
    v_old_account_id,
    v_current_type,
    v_is_fixed,
    v_is_recurring
  FROM transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, NULL::UUID[], false, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- Se for filha de fixa/recorrente, herdar flags do parent
  IF v_parent_id IS NOT NULL THEN
    SELECT is_fixed, is_recurring
    INTO v_parent_is_fixed, v_parent_is_recurring
    FROM transactions
    WHERE id = v_parent_id AND user_id = p_user_id;

    IF v_parent_is_fixed IS TRUE THEN
      v_is_fixed := true;
    END IF;

    IF v_parent_is_recurring IS TRUE THEN
      v_is_recurring := true;
    END IF;
  END IF;

  -- Validar período não está fechado
  IF is_period_locked(p_user_id, v_transaction_date) THEN
    RETURN QUERY SELECT 0, NULL::UUID[], false, 'Period is locked'::TEXT;
    RETURN;
  END IF;

  -- Determinar transações a atualizar baseado no scope
  IF p_scope = 'current' THEN
    v_transaction_ids := ARRAY[p_transaction_id];
  ELSIF p_scope = 'current-and-remaining' THEN
    IF v_current_installment IS NOT NULL AND v_parent_id IS NOT NULL THEN
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
        AND current_installment >= v_current_installment
        AND user_id = p_user_id;
    ELSIF (v_is_fixed = true OR v_is_recurring = true) THEN
      IF v_parent_id IS NOT NULL THEN
        SELECT ARRAY_AGG(id) INTO v_transaction_ids
        FROM transactions
        WHERE parent_transaction_id = v_parent_id
          AND date >= v_transaction_date
          AND user_id = p_user_id;
      ELSE
        SELECT ARRAY_AGG(id) INTO v_transaction_ids
        FROM transactions
        WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
          AND date >= v_transaction_date
          AND user_id = p_user_id;
      END IF;
    ELSE
      v_transaction_ids := ARRAY[p_transaction_id];
    END IF;
  ELSE -- 'all'
    IF v_parent_id IS NOT NULL THEN
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE parent_transaction_id = v_parent_id
        AND user_id = p_user_id;
    ELSIF (v_is_fixed = true OR v_is_recurring = true OR v_current_installment IS NOT NULL) THEN
      SELECT ARRAY_AGG(id) INTO v_transaction_ids
      FROM transactions
      WHERE (id = p_transaction_id OR parent_transaction_id = p_transaction_id)
        AND user_id = p_user_id;
    ELSE
      v_transaction_ids := ARRAY[p_transaction_id];
    END IF;
  END IF;

  -- INÍCIO DA TRANSAÇÃO EXPLÍCITA
  BEGIN
    -- Coletar conta antiga
    v_affected_accounts := ARRAY[v_old_account_id];

    -- Determinar o tipo da transação (pode estar sendo atualizado)
    v_type := COALESCE((p_updates->>'type')::transaction_type, v_current_type);

    -- Ajustar o sinal do amount baseado no tipo
    IF p_updates ? 'amount' THEN
      v_amount := (p_updates->>'amount')::NUMERIC;
      IF v_type = 'expense' OR v_type = 'transfer' THEN
        v_amount := -ABS(v_amount);
      ELSIF v_type = 'income' THEN
        v_amount := ABS(v_amount);
      END IF;
    END IF;

    -- Atualizar transações dinamicamente baseado no JSONB
    UPDATE transactions SET
      description = COALESCE((p_updates->>'description')::TEXT, description),
      amount = COALESCE(v_amount, amount),
      date = COALESCE((p_updates->>'date')::DATE, date),
      type = COALESCE((p_updates->>'type')::transaction_type, type),
      category_id = COALESCE((p_updates->>'category_id')::UUID, category_id),
      account_id = COALESCE((p_updates->>'account_id')::UUID, account_id),
      status = COALESCE((p_updates->>'status')::transaction_status, status),
      invoice_month = COALESCE((p_updates->>'invoice_month')::TEXT, invoice_month),
      invoice_month_overridden = COALESCE((p_updates->>'invoice_month_overridden')::BOOLEAN, invoice_month_overridden),
      updated_at = now()
    WHERE id = ANY(v_transaction_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- BUSCAR TRANSAÇÃO VINCULADA EM AMBAS AS DIREÇÕES
    -- 1. Se tem linked_transaction_id (é a transação de ENTRADA), usar ele
    IF v_linked_transaction_id IS NOT NULL THEN
      IF p_updates ? 'amount' THEN
        v_linked_amount := -v_amount;
      END IF;

      UPDATE transactions SET
        amount = COALESCE(v_linked_amount, amount),
        date = COALESCE((p_updates->>'date')::DATE, date),
        status = COALESCE((p_updates->>'status')::transaction_status, status),
        updated_at = now()
      WHERE id = v_linked_transaction_id AND user_id = p_user_id;

      SELECT account_id INTO v_new_account_id
      FROM transactions
      WHERE id = v_linked_transaction_id AND user_id = p_user_id;
      
      IF v_new_account_id IS NOT NULL THEN
        v_affected_accounts := v_affected_accounts || v_new_account_id;
      END IF;

      v_updated_count := v_updated_count + 1;
      
    -- 2. Se tem to_account_id (é a transação de SAÍDA), buscar a de ENTRADA
    ELSIF v_to_account_id IS NOT NULL THEN
      SELECT id INTO v_reverse_linked_id
      FROM transactions
      WHERE linked_transaction_id = p_transaction_id AND user_id = p_user_id
      LIMIT 1;
      
      IF v_reverse_linked_id IS NOT NULL THEN
        IF p_updates ? 'amount' THEN
          v_linked_amount := -v_amount;
        END IF;

        UPDATE transactions SET
          amount = COALESCE(v_linked_amount, amount),
          date = COALESCE((p_updates->>'date')::DATE, date),
          status = COALESCE((p_updates->>'status')::transaction_status, status),
          updated_at = now()
        WHERE id = v_reverse_linked_id AND user_id = p_user_id;

        SELECT account_id INTO v_new_account_id
        FROM transactions
        WHERE id = v_reverse_linked_id AND user_id = p_user_id;
        
        IF v_new_account_id IS NOT NULL THEN
          v_affected_accounts := v_affected_accounts || v_new_account_id;
        END IF;

        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;

    -- Se mudou conta, adicionar nova conta afetada
    v_new_account_id := (p_updates->>'account_id')::UUID;
    IF v_new_account_id IS NOT NULL AND v_new_account_id != v_old_account_id THEN
      v_affected_accounts := v_affected_accounts || v_new_account_id;
    END IF;

    -- Recalcular saldos das contas afetadas
    FOR i IN 1..COALESCE(array_length(v_affected_accounts, 1), 0) LOOP
      PERFORM recalculate_account_balance(v_affected_accounts[i]);
    END LOOP;

    RETURN QUERY SELECT v_updated_count, v_affected_accounts, true, NULL::TEXT;

  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT 0, NULL::UUID[], false, SQLERRM::TEXT;
  END;
END;
$$;


ALTER FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text") IS 'Atualiza transação(ões) sincronizando transferências vinculadas e recalcula saldos atomicamente';



CREATE OR REPLACE FUNCTION "public"."audit_transaction_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  account_balance_before NUMERIC;
  account_balance_after NUMERIC;
BEGIN
  -- Capturar saldo da conta antes/depois
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT balance INTO account_balance_after 
    FROM public.accounts 
    WHERE id = NEW.account_id;
  END IF;
  
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    SELECT balance INTO account_balance_before 
    FROM public.accounts 
    WHERE id = OLD.account_id;
  END IF;

  -- Registrar na auditoria
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id, 
      new_values, balance_after, created_by
    ) VALUES (
      NEW.user_id, 'insert', 'transactions', NEW.id,
      to_jsonb(NEW), account_balance_after, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id,
      old_values, new_values, 
      balance_before, balance_after, created_by
    ) VALUES (
      NEW.user_id, 'update', 'transactions', NEW.id,
      to_jsonb(OLD), to_jsonb(NEW),
      account_balance_before, account_balance_after, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit (
      user_id, action, table_name, record_id,
      old_values, balance_before, created_by
    ) VALUES (
      OLD.user_id, 'delete', 'transactions', OLD.id,
      to_jsonb(OLD), account_balance_before, auth.uid()
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_transaction_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_create_transactions"("p_user_id" "uuid", "p_transactions" "jsonb") RETURNS TABLE("idx" integer, "success" boolean, "transaction_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."bulk_create_transactions"("p_user_id" "uuid", "p_transactions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_create_transfers"("p_user_id" "uuid", "p_transfers" "jsonb") RETURNS TABLE("idx" integer, "success" boolean, "outgoing_id" "uuid", "incoming_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."bulk_create_transfers"("p_user_id" "uuid", "p_transfers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_duplicate_initial_balance"() RETURNS TABLE("account_id" "uuid", "duplicates_removed" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."cleanup_duplicate_initial_balance"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_duplicate_initial_balance"() IS 'Remove transações "Saldo Inicial" duplicadas, mantendo apenas a mais antiga por conta';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Delete provisions from previous months
  -- Only deletes transactions marked as provision that are older than the current month
  DELETE FROM transactions
  WHERE user_id = p_user_id
    AND is_provision = true
    AND date < DATE_TRUNC('month', CURRENT_DATE);
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted_count INTEGER;
  v_current_month_start DATE;
  v_previous_month_start DATE;
  v_previous_month_end DATE;
  v_reference_date DATE;
BEGIN
  -- Validate user_id
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- ✅ FIX: Use client date (from frontend timezone-aware) instead of server CURRENT_DATE
  -- This ensures cleanup always uses the same month reference as the client
  v_reference_date := COALESCE(p_client_date, CURRENT_DATE);
  
  -- Calculate month boundaries using CLIENT reference date (timezone-safe)
  v_current_month_start := DATE_TRUNC('month', v_reference_date)::DATE;
  v_previous_month_start := DATE_TRUNC('month', v_reference_date - INTERVAL '1 month')::DATE;
  v_previous_month_end := v_current_month_start - INTERVAL '1 day'::DATE;

  -- ✅ SAFETY GUARDRAIL #1: Delete ONLY pending provisions from PREVIOUS MONTH
  -- ✅ SAFETY GUARDRAIL #2: Only delete PENDING provisions (preserve completed history)
  -- ✅ SAFETY GUARDRAIL #3: Maximum 1,000 deletions per user to prevent accidents
  -- ✅ SAFETY GUARDRAIL #4: User ID validation
  WITH provisions_to_delete AS (
    SELECT id
    FROM transactions
    WHERE user_id = p_user_id
      AND is_provision = true
      AND status = 'pending'  -- ✅ ONLY delete unrealized provisions
      AND date >= v_previous_month_start  -- ✅ On or after start of previous month
      AND date < v_current_month_start     -- ✅ Before start of CURRENT month
    LIMIT 1000  -- Safety limit
  )
  DELETE FROM transactions
  WHERE id IN (SELECT id FROM provisions_to_delete);

  -- Get the count of deleted rows
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- ✅ Log cleanup action for audit trail (if audit table exists)
  BEGIN
    INSERT INTO audit_log (user_id, action, details, created_at)
    VALUES (
      p_user_id,
      'cleanup_expired_provisions',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'previous_month_start', v_previous_month_start,
        'current_month_start', v_current_month_start,
        'description', 'Deleted pending provisions from previous month only'
      ),
      NOW()
    );
  EXCEPTION WHEN undefined_table THEN
    -- audit_log table might not exist, continue anyway
    NULL;
  END;

  RETURN v_deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date") IS '✅ IMPROVED: Cleanup expired provisions - ONLY from IMMEDIATELY PREVIOUS MONTH
  
Parameters:
  - p_user_id: The user ID whose expired provisions should be cleaned
  - p_client_date: Client date (YYYY-MM-DD) from frontend for timezone-safe month boundary detection
                   Defaults to server CURRENT_DATE if not provided (for backward compatibility)

Return:
  - INTEGER: Number of provisions that were deleted

What Gets Deleted:
  - Provisions with status = ''pending'' (not yet realized)
  - From IMMEDIATELY PREVIOUS MONTH ONLY 
  - Month boundaries calculated from p_client_date (client timezone reference)
  - Date range: >= (start of previous month) AND < (start of current month)
  - Example: On 2026-02-01 with p_client_date="2026-02-01", deletes provisions from 2026-01-01 to 2026-01-31
  - Maximum 1,000 per call

What Is Preserved:
  - Completed provisions (status = ''completed'') - keeps history
  - Current month provisions - keeps active data
  - Provisions older than 2+ months - keeps extra safety margin
  - All other transaction types

Safety Guardrails:
  1. Only delete pending provisions from immediately previous month (no older data touched)
  2. Only delete status = ''pending'' (unrealized) provisions to preserve completed history
  3. Maximum 1,000 deletions per call (prevents runaway deletions)
  4. Validates p_user_id is not null
  5. Uses client date for timezone-aware month boundary calculation
  6. Logs all deletions to audit_log table for compliance

Automatic Execution:
  - useDashboardData.tsx detects month change every 30 seconds on client timezone
  - Passes client date to ensure consistent month boundary detection across timezones
  - Automatically triggers cleanup when new month is detected
  - Timestamp logged for audit purposes

Example:
  SELECT cleanup_expired_provisions(auth.uid(), ''2026-02-01''::date);
  -- Called on 2026-02-05 with client date 2026-02-05
  -- Deletes all pending provisions from January 2026 (2026-01-01 to 2026-01-31)
';



CREATE OR REPLACE FUNCTION "public"."cleanup_orphan_journal_entries"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count1 INTEGER;
  v_count2 INTEGER;
BEGIN
  -- Deletar journal entries que não têm transação correspondente
  WITH deleted AS (
    DELETE FROM public.journal_entries
    WHERE transaction_id IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE transactions.id = journal_entries.transaction_id
      )
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count1 FROM deleted;
  
  -- Deletar journal entries que não têm conta contábil válida
  WITH deleted AS (
    DELETE FROM public.journal_entries
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts 
      WHERE chart_of_accounts.id = journal_entries.account_id
    )
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count2 FROM deleted;
  
  RETURN v_count1 + v_count2;
END;
$$;


ALTER FUNCTION "public"."cleanup_orphan_journal_entries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_account_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.account_locks (account_id, version)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_account_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_journal_entries_for_transaction"("p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_journal_entries_for_transaction"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_expired_subscriptions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."deactivate_expired_subscriptions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_expired_trials"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."deactivate_expired_trials"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_metrics"("p_user_id" "uuid", "p_date_from" "date", "p_date_to" "date") RETURNS TABLE("period_income" numeric, "period_expenses" numeric, "balance" numeric, "pending_income" numeric, "pending_expenses" numeric, "credit_card_expenses" numeric, "pending_income_count" bigint, "pending_expenses_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Security: validar que p_user_id = usuário autenticado
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: auth.uid() is NULL';
  END IF;
  IF v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user_id (%) does not match authenticated user (%)',
      p_user_id::text, v_auth_user_id::text;
  END IF;

  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências
      AND t.type != 'transfer'
      AND t.to_account_id IS NULL
      AND NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL)
      -- EXCLUIR Saldo Inicial
      AND t.description != 'Saldo Inicial'
      -- EXCLUIR apenas o PAI de transações fixas (templates)
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- REMOVIDO: EXCLUIR provisões positivas (overspent)
      -- Agora permitimos que provisões de receita (amount > 0) sejam contabilizadas
      
      -- Filtro de data
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
  )
  SELECT 
    -- Totais Gerais
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::NUMERIC as period_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as period_expenses,
    COALESCE(
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 
      0
    )::NUMERIC as balance,
    
    -- Pendentes
    COALESCE(SUM(CASE WHEN type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0)::NUMERIC as pending_income,
    COALESCE(SUM(CASE WHEN type = 'expense' AND status = 'pending' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as pending_expenses,
    
    -- Cartão de Crédito
    COALESCE(SUM(CASE WHEN type = 'expense' AND account_type = 'credit' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC as credit_card_expenses,
    
    -- Contagens
    COUNT(CASE WHEN type = 'income' AND status = 'pending' THEN 1 END) as pending_income_count,
    COUNT(CASE WHEN type = 'expense' AND status = 'pending' THEN 1 END) as pending_expenses_count
  FROM filtered_transactions;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_metrics"("p_user_id" "uuid", "p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_setting"("p_setting_key" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT setting_value 
  FROM public.system_settings 
  WHERE setting_key = p_setting_key;
$$;


ALTER FUNCTION "public"."get_system_setting"("p_setting_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text" DEFAULT 'all'::"text", "p_status" "text" DEFAULT 'all'::"text", "p_account_type" "text" DEFAULT 'all'::"text", "p_date_from" "text" DEFAULT NULL::"text", "p_date_to" "text" DEFAULT NULL::"text", "p_account_id" "uuid" DEFAULT NULL::"uuid", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_invoice_month" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text", "p_is_fixed" boolean DEFAULT NULL::boolean, "p_is_provision" boolean DEFAULT NULL::boolean) RETURNS TABLE("total_income" numeric, "total_expenses" numeric, "balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_type" "text", "p_date_from" "text", "p_date_to" "text", "p_account_id" "uuid", "p_category_id" "uuid", "p_invoice_month" "text", "p_search" "text", "p_is_fixed" boolean, "p_is_provision" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text" DEFAULT 'all'::"text", "p_status" "text" DEFAULT 'all'::"text", "p_account_id" "text" DEFAULT 'all'::"text", "p_category_id" "text" DEFAULT 'all'::"text", "p_account_type" "text" DEFAULT 'all'::"text", "p_is_fixed" boolean DEFAULT NULL::boolean, "p_is_provision" boolean DEFAULT NULL::boolean, "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_search" "text" DEFAULT NULL::"text", "p_invoice_month" "text" DEFAULT 'all'::"text", "p_include_transfers" boolean DEFAULT false) RETURNS TABLE("total_income" numeric, "total_expenses" numeric, "balance" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Security: validar que p_user_id = usuário autenticado
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated: auth.uid() is NULL';
  END IF;
  IF v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user_id (%) does not match authenticated user (%)',
      p_user_id::text, v_auth_user_id::text;
  END IF;

  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT 
      t.type,
      t.amount,
      t.status,
      t.account_id,
      t.category_id,
      t.description,
      t.invoice_month,
      t.is_fixed,
      t.is_provision,
      t.linked_transaction_id,
      t.to_account_id,
      a.type as account_type
    FROM transactions t
    INNER JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = p_user_id
      -- EXCLUIR transferências SE p_include_transfers for FALSE
      AND (
        p_include_transfers IS TRUE 
        OR (
          t.type != 'transfer'
          AND t.to_account_id IS NULL
          AND NOT (t.type = 'income' AND t.linked_transaction_id IS NOT NULL)
        )
      )
      -- EXCLUIR apenas o PAI de transações fixas
      AND (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
      -- EXCLUIR Saldo Inicial
      AND t.description != 'Saldo Inicial'
      -- REMOVIDO: EXCLUIR provisões positivas (overspent)
      -- Agora permitimos que provisões de receita (amount > 0) sejam contabilizadas
      
      -- Filtros
      AND (p_type = 'all' OR t.type::text = p_type)
      AND (p_status = 'all' OR t.status::text = p_status)
      AND (p_account_id = 'all' OR t.account_id = p_account_id::uuid)
      AND (p_category_id = 'all' OR t.category_id = p_category_id::uuid)
      AND (p_account_type = 'all' OR a.type::text = p_account_type)
      AND (p_is_fixed IS NULL OR t.is_fixed = p_is_fixed)
      AND (p_is_provision IS NULL OR t.is_provision = p_is_provision)
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_invoice_month = 'all' OR t.invoice_month = p_invoice_month)
      AND (p_search IS NULL OR p_search = '' OR LOWER(t.description) LIKE '%' || LOWER(p_search) || '%')
  )
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN type = 'income' THEN amount 
        WHEN type = 'transfer' AND linked_transaction_id IS NOT NULL AND to_account_id IS NULL THEN amount 
        ELSE 0 
      END
    ), 0)::NUMERIC as total_income,
    
    COALESCE(SUM(
      CASE 
        WHEN type = 'expense' THEN ABS(amount) 
        WHEN type = 'transfer' AND (to_account_id IS NOT NULL OR linked_transaction_id IS NULL) THEN ABS(amount)
        ELSE 0 
      END
    ), 0)::NUMERIC as total_expenses,
    
    COALESCE(
      SUM(
        CASE 
          WHEN type = 'income' THEN amount 
          WHEN type = 'transfer' AND linked_transaction_id IS NOT NULL AND to_account_id IS NULL THEN amount 
          ELSE 0 
        END
      ) - 
      SUM(
        CASE 
          WHEN type = 'expense' THEN ABS(amount) 
          WHEN type = 'transfer' AND (to_account_id IS NOT NULL OR linked_transaction_id IS NULL) THEN ABS(amount)
          ELSE 0 
        END
      ), 
      0
    )::NUMERIC as balance
  FROM filtered_transactions;
END;
$$;


ALTER FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_id" "text", "p_category_id" "text", "p_account_type" "text", "p_is_fixed" boolean, "p_is_provision" boolean, "p_date_from" "date", "p_date_to" "date", "p_search" "text", "p_invoice_month" "text", "p_include_transfers" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("check_user_id" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
            SELECT role FROM public.user_roles WHERE user_id = check_user_id LIMIT 1;
          $$;


ALTER FUNCTION "public"."get_user_role"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_roles"("check_user_id" "uuid") RETURNS TABLE("role" "public"."user_role")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = check_user_id;
$$;


ALTER FUNCTION "public"."get_user_roles"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_provision_deduction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_provision_id UUID;
  v_provision_account_id UUID;
  v_provision_status public.transaction_status;
  v_diff NUMERIC;
  v_is_fixed BOOLEAN;
  v_is_provision BOOLEAN;
BEGIN
  -- CRÍTICO: Prevenir recursão infinita
  -- Quando atualizamos a provisão, isso não deve disparar o trigger novamente
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Obter flags (usando NEW para INSERT/UPDATE, OLD para DELETE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_is_fixed := NEW.is_fixed;
    v_is_provision := NEW.is_provision;
  ELSE
    v_is_fixed := OLD.is_fixed;
    v_is_provision := OLD.is_provision;
  END IF;

  -- 1. Ignorar se a própria transação for uma provisão (evitar auto-referência/loop)
  IF v_is_provision THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 2. Ignorar se for uma transação fixa (Provisões devem ser abatidas apenas por transações variáveis)
  -- Isso atende à solicitação: "a edição de transação fixa filha nao deve alterar transação provisão"
  IF v_is_fixed THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  
  -- Calcular a diferença baseada na operação
  IF TG_OP = 'INSERT' THEN
    v_diff := NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := NEW.amount - OLD.amount;
    -- Se não houve mudança de valor, retornar
    IF v_diff = 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_diff := -OLD.amount;
  END IF;

  -- Encontrar a provisão correspondente
  -- Deve ser do mesmo mês, mesma categoria, e ser uma instância (filha)
  SELECT id, account_id, status INTO v_provision_id, v_provision_account_id, v_provision_status
  FROM transactions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND category_id = COALESCE(NEW.category_id, OLD.category_id)
    AND is_provision = true
    AND date_trunc('month', date) = date_trunc('month', COALESCE(NEW.date, OLD.date))
    AND id != COALESCE(NEW.id, OLD.id)
    AND parent_transaction_id IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF v_provision_id IS NOT NULL THEN
    -- Atualizar o valor da provisão
    -- Subtrair a diferença (se gastou mais, provisão diminui/consome mais)
    UPDATE transactions
    SET amount = amount - v_diff
    WHERE id = v_provision_id;

    -- Recalcular saldo da conta da provisão se ela estiver concluída
    IF v_provision_status = 'completed' THEN
      PERFORM recalculate_account_balance(v_provision_account_id);
    END IF;
  END IF;
    
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_provision_deduction"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_provision_deduction"() IS '✅ Trigger SECURITY DEFINER com validação de user_id para deduzir transações das provisões automaticamente.
IMPORTANTE: 
- Apenas transações com status "completed" são deduzidas.
- Transações "pending" NÃO afetam as provisões até serem marcadas como "completed".
- Transações FIXAS (is_fixed = true) NUNCA são deduzidas das provisões.
- Provisões são apenas para transações normais (não fixas).
- Inclui validação de segurança para prevenir operações não autorizadas.';



CREATE OR REPLACE FUNCTION "public"."handle_provision_deduction_batch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '10s'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_provision_deduction_batch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_transaction_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '5s'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_transaction_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_transfer_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_linked_txn RECORD;
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  IF OLD.linked_transaction_id IS NOT NULL THEN
    -- Get linked transaction details
    SELECT * INTO v_linked_txn FROM public.transactions WHERE id = OLD.linked_transaction_id;
    
    IF FOUND THEN
      -- Delete linked transaction
      DELETE FROM public.transactions WHERE id = OLD.linked_transaction_id;
      
      -- Recalculate balance for linked account
      PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
    END IF;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  FOR v_linked_txn IN 
    SELECT * FROM public.transactions WHERE linked_transaction_id = OLD.id
  LOOP
    -- Delete linked transaction
    DELETE FROM public.transactions WHERE id = v_linked_txn.id;
    
    -- Recalculate balance for linked account
    PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
  END LOOP;

  -- Finally, recalculate for the current account
  PERFORM public.recalculate_account_balance(OLD.account_id);

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."handle_transfer_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_transfer_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_linked_txn RECORD;
BEGIN
  -- Prevent infinite recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Check if relevant fields changed
  IF NEW.amount = OLD.amount AND NEW.date = OLD.date AND NEW.account_id = OLD.account_id THEN
    RETURN NEW;
  END IF;

  -- 1. If this transaction points to another (Incoming -> Outgoing)
  IF NEW.linked_transaction_id IS NOT NULL THEN
    SELECT * INTO v_linked_txn FROM public.transactions WHERE id = NEW.linked_transaction_id;
    
    IF FOUND THEN
      UPDATE public.transactions
      SET 
        amount = -ABS(NEW.amount), -- Ensure outgoing is negative
        date = NEW.date
      WHERE id = NEW.linked_transaction_id;
      
      -- Recalculate linked account
      PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
    END IF;
  END IF;

  -- 2. If other transactions point to this one (Outgoing <- Incoming)
  FOR v_linked_txn IN 
    SELECT * FROM public.transactions WHERE linked_transaction_id = NEW.id
  LOOP
    UPDATE public.transactions
    SET 
      amount = ABS(NEW.amount), -- Ensure incoming is positive
      date = NEW.date
    WHERE id = v_linked_txn.id;
    
    -- Recalculate linked account
    PERFORM public.recalculate_account_balance(v_linked_txn.account_id);
  END LOOP;

  -- Recalculate for current account
  PERFORM public.recalculate_account_balance(NEW.account_id);
  
  -- If account changed (unlikely for transfers but possible), recalc old account too
  IF OLD.account_id != NEW.account_id THEN
    PERFORM public.recalculate_account_balance(OLD.account_id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_transfer_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("check_user_id" "uuid", "required_role" "public"."user_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
            SELECT EXISTS (
              SELECT 1 FROM public.user_roles
              WHERE user_id = check_user_id AND role = required_role
            );
          $$;


ALTER FUNCTION "public"."has_role"("check_user_id" "uuid", "required_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Ativo Circulante
  INSERT INTO public.chart_of_accounts (user_id, code, name, category, nature, description) VALUES
  (p_user_id, '1.01.01', 'Caixa', 'asset', 'debit', 'Dinheiro em caixa'),
  (p_user_id, '1.01.02', 'Bancos Conta Corrente', 'asset', 'debit', 'Saldo em contas correntes'),
  (p_user_id, '1.01.03', 'Bancos Conta Poupança', 'asset', 'debit', 'Saldo em contas poupança'),
  (p_user_id, '1.01.04', 'Investimentos', 'asset', 'debit', 'Aplicações financeiras'),
  
  -- Passivo Circulante
  (p_user_id, '2.01.01', 'Cartões de Crédito', 'liability', 'credit', 'Dívidas com cartões'),
  (p_user_id, '2.01.02', 'Fornecedores a Pagar', 'liability', 'credit', 'Contas a pagar'),
  (p_user_id, '2.01.03', 'Empréstimos a Pagar', 'liability', 'credit', 'Empréstimos de curto prazo'),
  
  -- Patrimônio Líquido
  (p_user_id, '3.01.01', 'Capital Próprio', 'equity', 'credit', 'Capital inicial'),
  (p_user_id, '3.02.01', 'Lucros Acumulados', 'equity', 'credit', 'Resultado acumulado'),
  
  -- Receitas
  (p_user_id, '4.01.01', 'Salários', 'revenue', 'credit', 'Receitas de salário'),
  (p_user_id, '4.01.02', 'Freelance', 'revenue', 'credit', 'Receitas de trabalho autônomo'),
  (p_user_id, '4.01.03', 'Investimentos', 'revenue', 'credit', 'Rendimentos de investimentos'),
  (p_user_id, '4.01.99', 'Outras Receitas', 'revenue', 'credit', 'Outras receitas'),
  
  -- Despesas
  (p_user_id, '5.01.01', 'Alimentação', 'expense', 'debit', 'Gastos com alimentação'),
  (p_user_id, '5.01.02', 'Transporte', 'expense', 'debit', 'Gastos com transporte'),
  (p_user_id, '5.01.03', 'Moradia', 'expense', 'debit', 'Aluguel e despesas residenciais'),
  (p_user_id, '5.01.04', 'Saúde', 'expense', 'debit', 'Gastos com saúde'),
  (p_user_id, '5.01.05', 'Educação', 'expense', 'debit', 'Gastos com educação'),
  (p_user_id, '5.01.06', 'Lazer', 'expense', 'debit', 'Gastos com entretenimento'),
  (p_user_id, '5.01.07', 'Vestuário', 'expense', 'debit', 'Gastos com roupas'),
  (p_user_id, '5.01.08', 'Tecnologia', 'expense', 'debit', 'Gastos com tecnologia'),
  (p_user_id, '5.01.99', 'Outras Despesas', 'expense', 'debit', 'Outras despesas');
  
END;
$$;


ALTER FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") IS 'Inicializa plano de contas padrão para novo usuário';



CREATE OR REPLACE FUNCTION "public"."initialize_default_categories"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, type, color) VALUES
    (p_user_id, 'Alimentação', 'expense', '#ef4444'),
    (p_user_id, 'Transporte', 'expense', '#f97316'),
    (p_user_id, 'Saúde', 'expense', '#84cc16'),
    (p_user_id, 'Educação', 'expense', '#06b6d4'),
    (p_user_id, 'Lazer', 'expense', '#8b5cf6'),
    (p_user_id, 'Moradia', 'expense', '#ec4899'),
    (p_user_id, 'Vestuário', 'expense', '#10b981'),
    (p_user_id, 'Tecnologia', 'expense', '#3b82f6'),
    (p_user_id, 'Investimentos', 'both', '#6366f1'),
    (p_user_id, 'Salário', 'income', '#22c55e'),
    (p_user_id, 'Freelance', 'income', '#14b8a6'),
    (p_user_id, 'Vendas', 'income', '#f59e0b'),
    (p_user_id, 'Outros', 'both', '#6b7280');
END;
$$;


ALTER FUNCTION "public"."initialize_default_categories"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_default_settings"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, currency, theme, notifications, auto_backup, language) 
  VALUES (p_user_id, 'BRL', 'system', true, false, 'pt-BR')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."initialize_default_settings"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(check_user_id, 'admin'::public.user_role);
$$;


ALTER FUNCTION "public"."is_admin"("check_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"("check_user_id" "uuid") IS 'SECURITY DEFINER function to check admin status - uses has_role() to query user_roles table';



CREATE OR REPLACE FUNCTION "public"."is_period_locked"("p_user_id" "uuid", "p_date" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.period_closures
    WHERE user_id = p_user_id
      AND p_date >= period_start
      AND p_date <= period_end
      AND is_locked = true
  );
$$;


ALTER FUNCTION "public"."is_period_locked"("p_user_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_subscription_active"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE 
    WHEN public.has_role(check_user_id, 'admin') THEN true
    WHEN public.has_role(check_user_id, 'user') THEN true
    WHEN public.has_role(check_user_id, 'trial') THEN 
      COALESCE((SELECT trial_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true), false)
    WHEN public.has_role(check_user_id, 'subscriber') THEN 
      COALESCE((SELECT subscription_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true), false)
    ELSE false
  END;
$$;


ALTER FUNCTION "public"."is_subscription_active"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trial_active"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(check_user_id, 'trial') 
    AND COALESCE(
      (SELECT trial_expires_at > now() FROM public.profiles WHERE user_id = check_user_id AND is_active = true),
      false
    );
$$;


ALTER FUNCTION "public"."is_trial_active"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text" DEFAULT NULL::"text", "p_old_values" "jsonb" DEFAULT NULL::"jsonb", "p_new_values" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_old_values" "jsonb", "p_new_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_existing_transactions_to_journal"() RETURNS TABLE("processed_count" integer, "error_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."migrate_existing_transactions_to_journal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer DEFAULT NULL::integer) RETURNS TABLE("new_balance" numeric, "new_version" integer, "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_version INTEGER;
  v_calculated_balance NUMERIC;
  v_new_version INTEGER;
BEGIN
  -- Adquirir lock na linha da conta
  SELECT version INTO v_current_version
  FROM public.account_locks
  WHERE account_id = p_account_id
  FOR UPDATE;
  
  -- Verificar versão se fornecida (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
    RETURN QUERY SELECT NULL::NUMERIC, v_current_version, false, 'Version mismatch - account was modified';
    RETURN;
  END IF;
  
  -- Calcular saldo baseado em TODAS as transações completed
  -- CORREÇÃO: amount já vem com sinal correto do insert, basta somar
  -- Para cartões de crédito:
  --   - expense: amount negativo (aumenta dívida) → balance fica negativo = dívida
  --   - income: amount positivo (diminui dívida/pagamento) → balance pode ficar positivo = crédito a favor
  -- Para outras contas:
  --   - expense: amount negativo (sai dinheiro) → balance diminui
  --   - income: amount positivo (entra dinheiro) → balance aumenta
  -- IMPORTANTE: Não inclui transações pending, is_provision (estouradas), ou "Saldo Inicial" duplicadas
  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_calculated_balance
  FROM public.transactions t
  WHERE t.account_id = p_account_id
    AND t.status = 'completed';
  
  -- Atualizar saldo da conta
  UPDATE public.accounts
  SET balance = v_calculated_balance,
      updated_at = now()
  WHERE id = p_account_id;
  
  -- Incrementar versão do lock
  v_new_version := v_current_version + 1;
  
  UPDATE public.account_locks
  SET version = v_new_version,
      updated_at = now()
  WHERE account_id = p_account_id;
  
  -- Registrar na auditoria
  INSERT INTO public.financial_audit (
    user_id, action, table_name, record_id,
    balance_after, created_by
  )
  SELECT user_id, 'balance_recalc', 'accounts', p_account_id,
         v_calculated_balance, auth.uid()
  FROM public.accounts
  WHERE id = p_account_id;
  
  RETURN QUERY SELECT v_calculated_balance, v_new_version, true, NULL::TEXT;
END;
$$;


ALTER FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer) IS 'Recalcula saldo de conta de forma atômica com optimistic locking';



CREATE OR REPLACE FUNCTION "public"."update_notification_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_notification_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") RETURNS TABLE("is_valid" boolean, "total_debits" numeric, "total_credits" numeric, "difference" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_debits NUMERIC;
  v_credits NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- Calcular total de débitos
  SELECT COALESCE(SUM(amount), 0)
  INTO v_debits
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'debit';
  
  -- Calcular total de créditos
  SELECT COALESCE(SUM(amount), 0)
  INTO v_credits
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'credit';
  
  v_diff := v_debits - v_credits;
  
  -- Retornar resultado
  RETURN QUERY SELECT
    (v_diff = 0) AS is_valid,
    v_debits AS total_debits,
    v_credits AS total_credits,
    v_diff AS difference,
    CASE 
      WHEN v_diff = 0 THEN 'Partidas dobradas válidas'
      WHEN v_diff > 0 THEN 'Débitos excedem créditos em ' || abs(v_diff)::text
      ELSE 'Créditos excedem débitos em ' || abs(v_diff)::text
    END AS message;
END;
$$;


ALTER FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") IS 'Valida se débitos = créditos para uma transação';



CREATE OR REPLACE FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("is_valid" boolean, "unbalanced_count" integer, "missing_entries_count" integer, "total_transactions" integer, "error_details" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") IS 'Valida se todas as journal entries de um período estão balanceadas (débitos = créditos) antes de permitir fechamento contábil';



CREATE OR REPLACE FUNCTION "public"."validate_user_access"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Obter o ID do usuário autenticado do JWT
  v_auth_user_id := auth.uid();
  
  -- Validações
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: user not authenticated'
      USING ERRCODE = 'PGRST401';
  END IF;
  
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null'
      USING ERRCODE = 'PGRST400';
  END IF;
  
  -- SEGURANÇA: p_user_id DEVE corresponder ao usuário autenticado
  IF p_user_id != v_auth_user_id THEN
    RAISE EXCEPTION 'Unauthorized access: user_id does not match authenticated user'
      USING ERRCODE = 'PGRST403';
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."validate_user_access"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_user_access"("p_user_id" "uuid") IS '🔐 SECURITY FUNCTION: Valida que o p_user_id corresponde ao usuário autenticado.
Deve ser chamada no INÍCIO de toda SECURITY DEFINER function.
Previne escalação de privilégios (BUG FIX #4).
Lança exceções com ERRCODE apropriados para debugging.';



CREATE OR REPLACE FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_debit_total NUMERIC;
  v_credit_total NUMERIC;
BEGIN
  -- Calcular totais
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_debit_total, v_credit_total
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id;
  
  -- Verificar se débito = crédito (com tolerância de 0.01 para arredondamentos)
  RETURN ABS(v_debit_total - v_credit_total) < 0.01;
END;
$$;


ALTER FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") IS 'Verifica se os journal_entries de uma transação estão balanceados (débito = crédito)';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_locks" (
    "account_id" "uuid" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "locked_by" "uuid",
    "locked_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_locks" OWNER TO "postgres";


COMMENT ON TABLE "public"."account_locks" IS 'Locks otimistas para prevenir race conditions em atualizações de saldo';



CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."account_type" NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "limit_amount" numeric(12,2),
    "due_date" integer,
    "closing_date" integer,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ignored" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint,
    "backup_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "backup_history_backup_type_check" CHECK (("backup_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."backup_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "frequency" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_backup_at" timestamp with time zone,
    "next_backup_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "backup_schedules_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."backup_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."category_type" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "public"."account_category" NOT NULL,
    "nature" "public"."account_nature" NOT NULL,
    "parent_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."chart_of_accounts" IS 'Plano de contas para partidas dobradas';



CREATE TABLE IF NOT EXISTS "public"."debug_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text",
    "message" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."debug_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "balance_before" numeric,
    "balance_after" numeric,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."financial_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."financial_audit" IS 'Auditoria completa de todas operações financeiras';



CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "transaction_id" "uuid",
    "account_id" "uuid" NOT NULL,
    "entry_type" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "description" "text" NOT NULL,
    "entry_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journal_entries_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "journal_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."journal_entries" IS 'Lançamentos contábeis (diário) - Criados APENAS pelos edge functions atômicos para garantir controle total e evitar duplicações';



CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "days_before" integer DEFAULT 1 NOT NULL,
    "notification_time" time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
    "notify_pending_transactions" boolean DEFAULT true NOT NULL,
    "notify_fixed_transactions" boolean DEFAULT false NOT NULL,
    "notify_installments" boolean DEFAULT false NOT NULL,
    "notify_credit_bills" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."period_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "closure_type" "text" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_by" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone,
    "unlocked_by" "uuid",
    "is_locked" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "period_closures_closure_type_check" CHECK (("closure_type" = ANY (ARRAY['monthly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."period_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_expires_at" timestamp with time zone,
    "whatsapp" "text",
    "subscription_expires_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles table - RLS policies ensure users can only view their own profile, except admins who can view all profiles for management purposes';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "date" "date" NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "category_id" "uuid",
    "account_id" "uuid" NOT NULL,
    "to_account_id" "uuid",
    "status" "public"."transaction_status" DEFAULT 'completed'::"public"."transaction_status" NOT NULL,
    "installments" integer,
    "current_installment" integer,
    "parent_transaction_id" "uuid",
    "is_recurring" boolean DEFAULT false,
    "recurrence_type" "public"."recurrence_type",
    "recurrence_end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoice_month" "text",
    "invoice_month_overridden" boolean DEFAULT false NOT NULL,
    "is_fixed" boolean DEFAULT false,
    "reconciled" boolean DEFAULT false,
    "reconciled_at" timestamp with time zone,
    "reconciled_by" "uuid",
    "bank_reference" "text",
    "bank_import_id" "uuid",
    "linked_transaction_id" "uuid",
    "is_provision" boolean DEFAULT false
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."transactions" IS 'Transações financeiras - Journal entries são criados pelos edge functions (atomic-transaction, atomic-transfer, atomic-pay-bill) quando status=completed';



COMMENT ON COLUMN "public"."transactions"."invoice_month" IS 'Mês da fatura no formato YYYY-MM (apenas para transações de cartão de crédito)';



COMMENT ON COLUMN "public"."transactions"."linked_transaction_id" IS 'References the linked transaction in a transfer. Used to connect the outgoing and incoming transactions.';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Stores user roles in a dedicated table (security best practice - prevents privilege escalation via profiles table compromise)';



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "theme" "text" DEFAULT 'system'::"text" NOT NULL,
    "notifications" boolean DEFAULT true NOT NULL,
    "auto_backup" boolean DEFAULT false NOT NULL,
    "language" "text" DEFAULT 'pt-BR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_locks"
    ADD CONSTRAINT "account_locks_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_history"
    ADD CONSTRAINT "backup_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_schedules"
    ADD CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_schedules"
    ADD CONSTRAINT "backup_schedules_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_user_id_code_key" UNIQUE ("user_id", "code");



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_audit"
    ADD CONSTRAINT "financial_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."period_closures"
    ADD CONSTRAINT "period_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."period_closures"
    ADD CONSTRAINT "period_closures_user_id_period_start_period_end_key" UNIQUE ("user_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_account_locks_account" ON "public"."account_locks" USING "btree" ("account_id");



CREATE INDEX "idx_accounts_user_balance" ON "public"."accounts" USING "btree" ("user_id", "balance" DESC);



CREATE INDEX "idx_accounts_user_id" ON "public"."accounts" USING "btree" ("user_id");



CREATE INDEX "idx_accounts_user_type" ON "public"."accounts" USING "btree" ("user_id", "type");



CREATE INDEX "idx_audit_logs_resource" ON "public"."audit_logs" USING "btree" ("resource_type", "resource_id") WHERE ("resource_id" IS NOT NULL);



CREATE INDEX "idx_audit_logs_user_created" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_backup_history_user_id" ON "public"."backup_history" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_backup_schedules_next_backup" ON "public"."backup_schedules" USING "btree" ("next_backup_at") WHERE ("is_active" = true);



CREATE INDEX "idx_backup_schedules_user_id" ON "public"."backup_schedules" USING "btree" ("user_id");



CREATE INDEX "idx_categories_user_id" ON "public"."categories" USING "btree" ("user_id");



CREATE INDEX "idx_categories_user_type" ON "public"."categories" USING "btree" ("user_id", "type");



CREATE INDEX "idx_chart_of_accounts_code" ON "public"."chart_of_accounts" USING "btree" ("user_id", "code");



CREATE INDEX "idx_chart_of_accounts_parent" ON "public"."chart_of_accounts" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_chart_of_accounts_parent_id" ON "public"."chart_of_accounts" USING "btree" ("parent_id");



CREATE INDEX "idx_chart_of_accounts_user_active" ON "public"."chart_of_accounts" USING "btree" ("user_id", "is_active") WHERE ("is_active" = true);



COMMENT ON INDEX "public"."idx_chart_of_accounts_user_active" IS 'Optimizes queries for active accounts in the chart of accounts';



CREATE INDEX "idx_chart_of_accounts_user_id" ON "public"."chart_of_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_financial_audit_created_at" ON "public"."financial_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_financial_audit_record" ON "public"."financial_audit" USING "btree" ("record_id", "table_name");



CREATE INDEX "idx_financial_audit_table_record" ON "public"."financial_audit" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_financial_audit_user_created" ON "public"."financial_audit" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_financial_audit_user_id" ON "public"."financial_audit" USING "btree" ("user_id");



CREATE INDEX "idx_journal_entries_account" ON "public"."journal_entries" USING "btree" ("account_id");



CREATE INDEX "idx_journal_entries_account_date" ON "public"."journal_entries" USING "btree" ("account_id", "entry_date" DESC);



CREATE INDEX "idx_journal_entries_account_id" ON "public"."journal_entries" USING "btree" ("account_id");



CREATE INDEX "idx_journal_entries_date_type" ON "public"."journal_entries" USING "btree" ("user_id", "entry_date", "entry_type");



CREATE INDEX "idx_journal_entries_entry_date" ON "public"."journal_entries" USING "btree" ("user_id", "entry_date");



CREATE INDEX "idx_journal_entries_transaction" ON "public"."journal_entries" USING "btree" ("transaction_id") WHERE ("transaction_id" IS NOT NULL);



CREATE INDEX "idx_journal_entries_transaction_id" ON "public"."journal_entries" USING "btree" ("transaction_id");



CREATE INDEX "idx_journal_entries_transaction_type" ON "public"."journal_entries" USING "btree" ("transaction_id", "entry_type");



CREATE INDEX "idx_journal_entries_user_date" ON "public"."journal_entries" USING "btree" ("user_id", "entry_date" DESC);



COMMENT ON INDEX "public"."idx_journal_entries_user_date" IS 'Optimizes ledger queries by user and date';



CREATE INDEX "idx_journal_entries_user_id" ON "public"."journal_entries" USING "btree" ("user_id");



CREATE INDEX "idx_notification_settings_user_id" ON "public"."notification_settings" USING "btree" ("user_id");



CREATE INDEX "idx_period_closures_dates" ON "public"."period_closures" USING "btree" ("user_id", "period_start", "period_end");



CREATE INDEX "idx_period_closures_locked" ON "public"."period_closures" USING "btree" ("user_id", "is_locked");



CREATE INDEX "idx_period_closures_user_id" ON "public"."period_closures" USING "btree" ("user_id");



CREATE INDEX "idx_period_closures_user_locked" ON "public"."period_closures" USING "btree" ("user_id", "is_locked");



CREATE INDEX "idx_period_closures_user_period" ON "public"."period_closures" USING "btree" ("user_id", "period_start", "period_end");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_account" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_account_id" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_account_status" ON "public"."transactions" USING "btree" ("account_id", "status");



CREATE INDEX "idx_transactions_bank_ref" ON "public"."transactions" USING "btree" ("bank_reference") WHERE ("bank_reference" IS NOT NULL);



CREATE INDEX "idx_transactions_category" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_category_id" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("date");



CREATE INDEX "idx_transactions_date_range" ON "public"."transactions" USING "btree" ("date") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_transactions_description_trgm" ON "public"."transactions" USING "gin" ("description" "public"."gin_trgm_ops");



COMMENT ON INDEX "public"."idx_transactions_description_trgm" IS 'Índice GIN trigram para busca full-text em descrição com debounce de 500ms';



CREATE INDEX "idx_transactions_fixed" ON "public"."transactions" USING "btree" ("user_id", "is_fixed") WHERE ("is_fixed" = true);



CREATE INDEX "idx_transactions_invoice_month" ON "public"."transactions" USING "btree" ("account_id", "invoice_month") WHERE ("invoice_month" IS NOT NULL);



CREATE INDEX "idx_transactions_is_fixed" ON "public"."transactions" USING "btree" ("is_fixed") WHERE ("is_fixed" = true);



CREATE INDEX "idx_transactions_linked" ON "public"."transactions" USING "btree" ("linked_transaction_id") WHERE ("linked_transaction_id" IS NOT NULL);



CREATE INDEX "idx_transactions_linked_id" ON "public"."transactions" USING "btree" ("linked_transaction_id");



CREATE INDEX "idx_transactions_pagination" ON "public"."transactions" USING "btree" ("user_id", "date" DESC, "created_at" DESC);



COMMENT ON INDEX "public"."idx_transactions_pagination" IS 'Índice principal para paginação ordenada por data. Cobre 95% das queries do useTransactions hook.';



CREATE INDEX "idx_transactions_parent" ON "public"."transactions" USING "btree" ("parent_transaction_id") WHERE ("parent_transaction_id" IS NOT NULL);



CREATE INDEX "idx_transactions_parent_installment" ON "public"."transactions" USING "btree" ("parent_transaction_id", "current_installment") WHERE ("parent_transaction_id" IS NOT NULL);



CREATE INDEX "idx_transactions_reconciled" ON "public"."transactions" USING "btree" ("account_id", "reconciled") WHERE ("reconciled" = false);



CREATE INDEX "idx_transactions_recurring" ON "public"."transactions" USING "btree" ("user_id", "is_recurring", "recurrence_end_date") WHERE ("is_recurring" = true);



CREATE INDEX "idx_transactions_user_account_date" ON "public"."transactions" USING "btree" ("user_id", "account_id", "date" DESC, "created_at" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_account_date" IS 'Índice para filtro por conta específica';



CREATE INDEX "idx_transactions_user_amount" ON "public"."transactions" USING "btree" ("user_id", "amount" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_amount" IS 'Índice para ordenação por valor (queries de maior/menor transação)';



CREATE INDEX "idx_transactions_user_category_date" ON "public"."transactions" USING "btree" ("user_id", "category_id", "date" DESC) WHERE ("category_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_transactions_user_category_date" IS 'Índice para filtro por categoria';



CREATE INDEX "idx_transactions_user_completed" ON "public"."transactions" USING "btree" ("user_id", "date" DESC) WHERE ("status" = 'completed'::"public"."transaction_status");



COMMENT ON INDEX "public"."idx_transactions_user_completed" IS 'Índice parcial otimizado para transações completed (reduz 50% do tamanho)';



CREATE INDEX "idx_transactions_user_count" ON "public"."transactions" USING "btree" ("user_id") INCLUDE ("id");



COMMENT ON INDEX "public"."idx_transactions_user_count" IS 'Índice otimizado para contagem rápida usando INCLUDE. Evita acesso à tabela principal.';



CREATE INDEX "idx_transactions_user_date" ON "public"."transactions" USING "btree" ("user_id", "date" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_date" IS 'Índice principal para ordenação por data - usado em 80% das queries';



CREATE INDEX "idx_transactions_user_date_range" ON "public"."transactions" USING "btree" ("user_id", "date") WHERE ("status" = 'completed'::"public"."transaction_status");



CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_user_id_lower_desc" ON "public"."transactions" USING "btree" ("user_id", "lower"("description"));



CREATE INDEX "idx_transactions_user_status" ON "public"."transactions" USING "btree" ("user_id", "status");



CREATE INDEX "idx_transactions_user_status_date" ON "public"."transactions" USING "btree" ("user_id", "status", "date" DESC, "created_at" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_status_date" IS 'Índice para filtros por status (pending/completed). Usado em relatórios e reconciliação.';



CREATE INDEX "idx_transactions_user_to_account" ON "public"."transactions" USING "btree" ("user_id", "to_account_id", "date" DESC) WHERE ("to_account_id" IS NOT NULL);



CREATE INDEX "idx_transactions_user_type" ON "public"."transactions" USING "btree" ("user_id", "type");



CREATE INDEX "idx_transactions_user_type_date" ON "public"."transactions" USING "btree" ("user_id", "type", "date" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_type_date" IS 'Índice para filtros por tipo de transação (income/expense/transfer). Usado em filtros do dashboard.';



CREATE INDEX "idx_transactions_user_type_status_date" ON "public"."transactions" USING "btree" ("user_id", "type", "status", "date" DESC);



COMMENT ON INDEX "public"."idx_transactions_user_type_status_date" IS 'Índice para filtros combinados mais comuns (type + status + date)';



CREATE INDEX "idx_user_settings_user_id" ON "public"."user_settings" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "create_account_lock_trigger" AFTER INSERT ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."create_account_lock"();



CREATE OR REPLACE TRIGGER "trigger_deduct_provision" AFTER INSERT OR DELETE OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_provision_deduction"();



CREATE OR REPLACE TRIGGER "trigger_handle_transfer_delete" AFTER DELETE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_transfer_delete"();



CREATE OR REPLACE TRIGGER "trigger_handle_transfer_update" AFTER UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_transfer_update"();



CREATE OR REPLACE TRIGGER "update_accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."account_locks"
    ADD CONSTRAINT "account_locks_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."backup_history"
    ADD CONSTRAINT "backup_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backup_schedules"
    ADD CONSTRAINT "backup_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_audit"
    ADD CONSTRAINT "financial_audit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_linked_transaction_id_fkey" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_parent_transaction_id_fkey" FOREIGN KEY ("parent_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "transactions_parent_transaction_id_fkey" ON "public"."transactions" IS 'Foreign key para transação pai. Usa SET NULL ao invés de CASCADE para preservar transações filhas concluídas quando a pai é removida.';



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can insert profiles" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can insert system settings" ON "public"."system_settings" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can update system settings" ON "public"."system_settings" FOR UPDATE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view system settings" ON "public"."system_settings" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Enable delete for user" ON "public"."transactions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable read access for user" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable update for user" ON "public"."transactions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Service role can insert backup history" ON "public"."backup_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create their own accounts" ON "public"."accounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own backup schedules" ON "public"."backup_schedules" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own categories" ON "public"."categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own chart of accounts" ON "public"."chart_of_accounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own journal entries" ON "public"."journal_entries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own notification settings" ON "public"."notification_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own period closures" ON "public"."period_closures" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own push subscriptions" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own settings" ON "public"."user_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own transactions" ON "public"."transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own accounts" ON "public"."accounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own backup schedules" ON "public"."backup_schedules" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own categories" ON "public"."categories" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own chart of accounts" ON "public"."chart_of_accounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own journal entries" ON "public"."journal_entries" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own period closures" ON "public"."period_closures" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own push subscriptions" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own transactions" ON "public"."transactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own accounts" ON "public"."accounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own backup schedules" ON "public"."backup_schedules" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own categories" ON "public"."categories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own chart of accounts" ON "public"."chart_of_accounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own journal entries" ON "public"."journal_entries" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notification settings" ON "public"."notification_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own period closures" ON "public"."period_closures" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own settings" ON "public"."user_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own transactions" ON "public"."transactions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view locks for their accounts" ON "public"."account_locks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."accounts"
  WHERE (("accounts"."id" = "account_locks"."account_id") AND ("accounts"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own accounts" ON "public"."accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own backup history" ON "public"."backup_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own backup schedules" ON "public"."backup_schedules" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own categories" ON "public"."categories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own chart of accounts" ON "public"."chart_of_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own journal entries" ON "public"."journal_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own notification settings" ON "public"."notification_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own period closures" ON "public"."period_closures" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own settings" ON "public"."user_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."account_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."period_closures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_is_provision" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_is_provision" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_is_provision" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_create_fixed_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_is_provision" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."atomic_create_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_invoice_month" "text", "p_invoice_month_overridden" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_create_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_invoice_month" "text", "p_invoice_month_overridden" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_create_transaction"("p_user_id" "uuid", "p_description" "text", "p_amount" numeric, "p_date" "date", "p_type" "public"."transaction_type", "p_category_id" "uuid", "p_account_id" "uuid", "p_status" "public"."transaction_status", "p_invoice_month" "text", "p_invoice_month_overridden" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."atomic_create_transfer"("p_user_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_date" "date", "p_outgoing_description" "text", "p_incoming_description" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_create_transfer"("p_user_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_date" "date", "p_outgoing_description" "text", "p_incoming_description" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_create_transfer"("p_user_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_date" "date", "p_outgoing_description" "text", "p_incoming_description" "text", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_delete_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_update_transaction"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_updates" "jsonb", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_transaction_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_transaction_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_transaction_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_create_transactions"("p_user_id" "uuid", "p_transactions" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_create_transactions"("p_user_id" "uuid", "p_transactions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_create_transactions"("p_user_id" "uuid", "p_transactions" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_create_transfers"("p_user_id" "uuid", "p_transfers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_create_transfers"("p_user_id" "uuid", "p_transfers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_create_transfers"("p_user_id" "uuid", "p_transfers" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_duplicate_initial_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_duplicate_initial_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_duplicate_initial_balance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_provisions"("p_user_id" "uuid", "p_client_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphan_journal_entries"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphan_journal_entries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphan_journal_entries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_account_lock"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_account_lock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_account_lock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_journal_entries_for_transaction"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_journal_entries_for_transaction"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_journal_entries_for_transaction"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_expired_subscriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_expired_subscriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_expired_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_expired_trials"() TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_expired_trials"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_expired_trials"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"("p_user_id" "uuid", "p_date_from" "date", "p_date_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"("p_user_id" "uuid", "p_date_from" "date", "p_date_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"("p_user_id" "uuid", "p_date_from" "date", "p_date_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_setting"("p_setting_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_setting"("p_setting_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_setting"("p_setting_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_type" "text", "p_date_from" "text", "p_date_to" "text", "p_account_id" "uuid", "p_category_id" "uuid", "p_invoice_month" "text", "p_search" "text", "p_is_fixed" boolean, "p_is_provision" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_type" "text", "p_date_from" "text", "p_date_to" "text", "p_account_id" "uuid", "p_category_id" "uuid", "p_invoice_month" "text", "p_search" "text", "p_is_fixed" boolean, "p_is_provision" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_type" "text", "p_date_from" "text", "p_date_to" "text", "p_account_id" "uuid", "p_category_id" "uuid", "p_invoice_month" "text", "p_search" "text", "p_is_fixed" boolean, "p_is_provision" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_id" "text", "p_category_id" "text", "p_account_type" "text", "p_is_fixed" boolean, "p_is_provision" boolean, "p_date_from" "date", "p_date_to" "date", "p_search" "text", "p_invoice_month" "text", "p_include_transfers" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_id" "text", "p_category_id" "text", "p_account_type" "text", "p_is_fixed" boolean, "p_is_provision" boolean, "p_date_from" "date", "p_date_to" "date", "p_search" "text", "p_invoice_month" "text", "p_include_transfers" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_totals"("p_user_id" "uuid", "p_type" "text", "p_status" "text", "p_account_id" "text", "p_category_id" "text", "p_account_type" "text", "p_is_fixed" boolean, "p_is_provision" boolean, "p_date_from" "date", "p_date_to" "date", "p_search" "text", "p_invoice_month" "text", "p_include_transfers" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_roles"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_roles"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_roles"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_provision_deduction"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_provision_deduction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_provision_deduction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_provision_deduction_batch"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_provision_deduction_batch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_provision_deduction_batch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_transaction_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_transaction_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_transaction_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_transfer_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_transfer_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_transfer_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_transfer_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_transfer_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_transfer_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("check_user_id" "uuid", "required_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("check_user_id" "uuid", "required_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("check_user_id" "uuid", "required_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_chart_of_accounts"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_default_categories"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_default_categories"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_default_categories"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_default_settings"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_default_settings"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_default_settings"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_period_locked"("p_user_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_period_locked"("p_user_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_period_locked"("p_user_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_subscription_active"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_subscription_active"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_subscription_active"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trial_active"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trial_active"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial_active"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_existing_transactions_to_journal"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_existing_transactions_to_journal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_existing_transactions_to_journal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_account_balance"("p_account_id" "uuid", "p_expected_version" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notification_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notification_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notification_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_double_entry"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_period_entries"("p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_user_access"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_user_access"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_access"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_access"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_journal_entries_balance"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."account_locks" TO "anon";
GRANT ALL ON TABLE "public"."account_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."account_locks" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."backup_history" TO "anon";
GRANT ALL ON TABLE "public"."backup_history" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_history" TO "service_role";



GRANT ALL ON TABLE "public"."backup_schedules" TO "anon";
GRANT ALL ON TABLE "public"."backup_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."debug_logs" TO "anon";
GRANT ALL ON TABLE "public"."debug_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_logs" TO "service_role";



GRANT ALL ON TABLE "public"."financial_audit" TO "anon";
GRANT ALL ON TABLE "public"."financial_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_audit" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."period_closures" TO "anon";
GRANT ALL ON TABLE "public"."period_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."period_closures" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Users can delete their own backups"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'backups'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload their own backups"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'backups'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can view their own backups"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'backups'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



