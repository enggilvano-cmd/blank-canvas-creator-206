-- Fix: Ensure journal_entries table has description column
-- This fixes the "column 'description' does not exist" error when creating transactions

-- Use standard SQL command which is safer and doesn't require PL/PGSQL block
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- Re-apply the trigger function just in case it was dropped or corrupted
CREATE OR REPLACE FUNCTION public.create_journal_entries_for_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_code TEXT;
  v_account_id UUID;
  v_category_name TEXT;
  v_category_type TEXT;
BEGIN
  -- Obter informações da categoria
  SELECT c.name, c.type
  INTO v_category_name, v_category_type
  FROM public.categories c
  WHERE c.id = NEW.category_id;
  
  -- Obter tipo da conta
  SELECT a.type INTO v_account_code
  FROM public.accounts a
  WHERE a.id = NEW.account_id;
  
  -- Determinar conta contábil baseada no tipo de transação
  IF NEW.type = 'income' THEN
    -- Receita: Débito na conta bancária, Crédito na receita
    
    -- Débito: Conta bancária (aumenta ativo)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND code LIKE '1.01.%'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type, 
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Receita (aumenta patrimônio)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND category = 'revenue'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
  ELSIF NEW.type = 'expense' THEN
    -- Despesa: Débito na despesa, Crédito na conta bancária
    
    -- Débito: Despesa (aumenta despesa)
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND category = 'expense'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Conta bancária ou cartão (diminui ativo ou aumenta passivo)
    IF v_account_code = 'credit' THEN
      -- Cartão de crédito: aumenta passivo
      SELECT id INTO v_account_id
      FROM public.chart_of_accounts
      WHERE user_id = NEW.user_id
        AND code = '2.01.01'
        AND is_active = true
      LIMIT 1;
    ELSE
      -- Conta bancária: diminui ativo
      SELECT id INTO v_account_id
      FROM public.chart_of_accounts
      WHERE user_id = NEW.user_id
        AND code LIKE '1.01.%'
        AND is_active = true
      LIMIT 1;
    END IF;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, NEW.description, NEW.date
      );
    END IF;
    
  ELSIF NEW.type = 'transfer' AND NEW.to_account_id IS NOT NULL THEN
    -- Transferência: Débito na conta destino, Crédito na conta origem
    
    -- Débito: Conta destino
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE user_id = NEW.user_id
      AND code LIKE '1.01.%'
      AND is_active = true
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'debit',
        NEW.amount, 'Transferência para: ' || NEW.description, NEW.date
      );
    END IF;
    
    -- Crédito: Conta origem
    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.journal_entries (
        user_id, transaction_id, account_id, entry_type,
        amount, description, entry_date
      ) VALUES (
        NEW.user_id, NEW.id, v_account_id, 'credit',
        NEW.amount, 'Transferência de: ' || NEW.description, NEW.date
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
