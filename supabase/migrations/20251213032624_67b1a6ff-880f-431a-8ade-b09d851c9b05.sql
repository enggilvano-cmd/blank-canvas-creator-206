-- Create atomic_create_fixed_transaction function
CREATE OR REPLACE FUNCTION public.atomic_create_fixed_transaction(
  p_user_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_type public.transaction_type,
  p_category_id UUID,
  p_account_id UUID,
  p_status public.transaction_status DEFAULT 'pending'::public.transaction_status,
  p_is_provision BOOLEAN DEFAULT false
)
RETURNS TABLE(
  success BOOLEAN,
  parent_id UUID,
  created_count INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent_id UUID;
  v_account_type TEXT;
  v_current_date DATE;
  v_child_id UUID;
  v_created_count INTEGER := 0;
  v_day_of_month INTEGER;
  v_amount_signed NUMERIC;
BEGIN
  -- Validate account belongs to user
  SELECT type INTO v_account_type
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate signed amount based on type
  IF p_type = 'expense' THEN
    v_amount_signed := -ABS(p_amount);
  ELSE
    v_amount_signed := ABS(p_amount);
  END IF;

  -- Get day of month from the input date
  v_day_of_month := EXTRACT(DAY FROM p_date);

  -- Create parent fixed transaction
  INSERT INTO transactions (
    user_id,
    description,
    amount,
    date,
    type,
    category_id,
    account_id,
    status,
    is_fixed,
    is_recurring,
    recurrence_type
  ) VALUES (
    p_user_id,
    p_description,
    v_amount_signed,
    p_date,
    p_type,
    p_category_id,
    p_account_id,
    'pending', -- Parent is always pending
    true,      -- is_fixed
    true,      -- is_recurring
    'monthly'  -- recurrence_type
  )
  RETURNING id INTO v_parent_id;

  v_created_count := 1;

  -- Create child transactions for the next 11 months
  v_current_date := p_date;
  FOR i IN 1..11 LOOP
    v_current_date := v_current_date + INTERVAL '1 month';
    
    -- Adjust day if it exceeds the days in the target month
    v_current_date := (DATE_TRUNC('month', v_current_date) + (LEAST(v_day_of_month, EXTRACT(DAY FROM (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER) - 1) * INTERVAL '1 day')::DATE;

    INSERT INTO transactions (
      user_id,
      description,
      amount,
      date,
      type,
      category_id,
      account_id,
      status,
      is_fixed,
      is_recurring,
      recurrence_type,
      parent_transaction_id
    ) VALUES (
      p_user_id,
      p_description,
      v_amount_signed,
      v_current_date,
      p_type,
      p_category_id,
      p_account_id,
      'pending',
      false,
      false,
      NULL,
      v_parent_id
    )
    RETURNING id INTO v_child_id;

    v_created_count := v_created_count + 1;
  END LOOP;

  RETURN QUERY SELECT true, v_parent_id, v_created_count, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, SQLERRM::TEXT;
END;
$$;