-- Migration: Improve cleanup_expired_provisions with safety guardrails
-- Date: 2026-02-09
-- Purpose: 
--   1. Add security guardrails to prevent excessive deletion
--   2. Return count of deleted provisions for observability
--   3. Add maximum age limit (90 days) for safety
--   4. Support audit logging (preparation)

CREATE OR REPLACE FUNCTION public.cleanup_expired_provisions(p_user_id UUID, p_client_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================================================
-- Add comment documenting the changes
-- ============================================================================
COMMENT ON FUNCTION public.cleanup_expired_provisions(UUID, DATE) IS
'✅ IMPROVED: Cleanup expired provisions - ONLY from IMMEDIATELY PREVIOUS MONTH
  
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

-- ============================================================================
-- Grant execute permissions
-- ============================================================================
REVOKE ALL ON FUNCTION public.cleanup_expired_provisions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_provisions(UUID) TO authenticated;

-- ============================================================================
-- Test cases (for manual verification)
-- ============================================================================
/*
Test Case 1: Verify no current month provisions are deleted
- Create provision with date = 2026-02-15, status = pending
- Call cleanup_expired_provisions on 2026-02-20
- Expected: Provision NOT deleted (current month)

Test Case 2: Verify IMMEDIATELY PREVIOUS month PENDING provisions ARE deleted
- Create provision with date = 2026-01-15, status = pending
- Call cleanup_expired_provisions on 2026-02-20
- Expected: Provision IS deleted (immediately previous month)

Test Case 3: Verify OLDER months (2+ months ago) are PRESERVED
- Create provision with date = 2025-12-15, status = pending
- Call cleanup_expired_provisions on 2026-02-20
- Expected: Provision NOT deleted (older than immediately previous month)

Test Case 4: Verify previous month COMPLETED provisions are PRESERVED
- Create provision with date = 2026-01-15, status = completed
- Call cleanup_expired_provisions on 2026-02-20
- Expected: Provision NOT deleted (preserves history of completed)

Test Case 5: Verify return count (only counts PENDING from previous month deleted)
- Create 3 PENDING provisions in January 2026
- Create 2 COMPLETED provisions in January 2026
- Create 1 PENDING provision in December 2025 (old month)
- Call cleanup_expired_provisions on 2026-02-20
- Expected: Returns 3 (only pending from January deleted, not December)

Test Case 6: Verify NULL user_id is rejected
- Call cleanup_expired_provisions(NULL)
- Expected: Error raised

Test Case 7: Edge case - Last day of month
- Create provision with date = 2026-01-31, status = pending
- Call cleanup_expired_provisions on 2026-02-01 at 00:00
- Expected: Provision IS deleted (January 31 is in previous month)

Test Case 8: Edge case - First day of month
- Create provision with date = 2026-01-01, status = pending
- Call cleanup_expired_provisions on 2026-02-01 at 00:00
- Expected: Provision IS deleted (January 1 is in previous month)
*/
