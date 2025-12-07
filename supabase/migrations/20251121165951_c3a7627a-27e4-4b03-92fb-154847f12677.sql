-- Performance optimization indexes for financial system
-- These indexes significantly improve query performance for common operations

-- Transactions table indexes
-- Most common queries: filter by user, date, type, account, status
CREATE INDEX IF NOT EXISTS idx_transactions_user_date 
  ON transactions(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type 
  ON transactions(user_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_user_status 
  ON transactions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_account 
  ON transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category 
  ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_date_range 
  ON transactions(date) 
  WHERE user_id IS NOT NULL;

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date 
  ON transactions(user_id, type, date DESC);

-- Index for installment queries
CREATE INDEX IF NOT EXISTS idx_transactions_parent 
  ON transactions(parent_transaction_id) 
  WHERE parent_transaction_id IS NOT NULL;

-- Index for linked transactions (transfers)
CREATE INDEX IF NOT EXISTS idx_transactions_linked 
  ON transactions(linked_transaction_id) 
  WHERE linked_transaction_id IS NOT NULL;

-- Index for recurring transactions
CREATE INDEX IF NOT EXISTS idx_transactions_recurring 
  ON transactions(user_id, is_recurring, recurrence_end_date) 
  WHERE is_recurring = true;

-- Index for fixed transactions
CREATE INDEX IF NOT EXISTS idx_transactions_fixed 
  ON transactions(user_id, is_fixed) 
  WHERE is_fixed = true;

-- Index for bank reconciliation
CREATE INDEX IF NOT EXISTS idx_transactions_reconciled 
  ON transactions(account_id, reconciled, date DESC);

-- Accounts table indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_type 
  ON accounts(user_id, type);

-- Categories table indexes
CREATE INDEX IF NOT EXISTS idx_categories_user_type 
  ON categories(user_id, type);

-- Journal entries indexes
-- Most common: queries by user, transaction, date, account
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date 
  ON journal_entries(user_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction 
  ON journal_entries(transaction_id) 
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_account 
  ON journal_entries(account_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_account_date 
  ON journal_entries(account_id, entry_date DESC);

-- Chart of accounts indexes
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_user_active 
  ON chart_of_accounts(user_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent 
  ON chart_of_accounts(parent_id) 
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_code 
  ON chart_of_accounts(user_id, code);

-- Period closures indexes
CREATE INDEX IF NOT EXISTS idx_period_closures_user_locked 
  ON period_closures(user_id, is_locked);

CREATE INDEX IF NOT EXISTS idx_period_closures_user_period 
  ON period_closures(user_id, period_start, period_end);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id 
  ON profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON profiles(email);

-- User settings indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id 
  ON user_settings(user_id);

-- Financial audit indexes
CREATE INDEX IF NOT EXISTS idx_financial_audit_user_created 
  ON financial_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_audit_record 
  ON financial_audit(record_id, table_name);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created 
  ON audit_logs(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource 
  ON audit_logs(resource_type, resource_id) 
  WHERE resource_id IS NOT NULL;

-- Account locks indexes
CREATE INDEX IF NOT EXISTS idx_account_locks_account 
  ON account_locks(account_id);

COMMENT ON INDEX idx_transactions_user_date IS 'Optimizes main transaction queries filtered by user and sorted by date';
COMMENT ON INDEX idx_transactions_user_type_date IS 'Optimizes queries filtering by user, type (income/expense/transfer) and date';
COMMENT ON INDEX idx_journal_entries_user_date IS 'Optimizes ledger queries by user and date';
COMMENT ON INDEX idx_chart_of_accounts_user_active IS 'Optimizes queries for active accounts in the chart of accounts';
