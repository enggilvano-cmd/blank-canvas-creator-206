import type { Transaction, Account, Category } from './index';

/**
 * Tipos tipados para operações da fila offline
 * Substitui o uso de 'unknown' e 'any' com tipos específicos
 */

// Tipos base para operações
export interface TransactionOperationData {
  description: string;
  amount: number;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  account_id: string;
  status: 'pending' | 'completed';
  to_account_id?: string;
  invoice_month?: string;
  invoice_month_overridden?: boolean;
  installments?: number;
  is_fixed?: boolean;
  is_provision?: boolean;
  id?: string; // Temporary ID
}

export interface EditTransactionOperationData {
  id?: string;
  transaction_id?: string; // Alias for id
  updates: Partial<Transaction> | Record<string, unknown>;
  scope?: 'current' | 'current-and-remaining' | 'all';
}

export interface DeleteTransactionOperationData {
  id: string;
  scope?: 'current' | 'current-and-remaining' | 'all';
}

export interface TransferOperationData {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  description: string;
}

export interface CreditPaymentOperationData {
  credit_account_id: string;
  debit_account_id: string;
  amount: number;
  payment_date: string;
}

export interface FixedTransactionOperationData {
  description: string;
  amount: number;
  start_date: string;
  recurrence: 'monthly' | 'yearly';
  type: 'income' | 'expense';
  category_id: string;
  account_id: string;
  status: 'pending' | 'completed';
}

export interface InstallmentsOperationData {
  transactions: TransactionOperationData[];
}

export interface ImportTransactionsOperationData {
  transactions: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>[];
}

export interface CategoryOperationData {
  name: string;
  type: 'income' | 'expense' | 'both';
  color: string;
  icon?: string;
  id?: string; // Temporary ID for add operations
}

export interface EditCategoryOperationData {
  id: string;
  updates: Partial<Category>;
}

export interface DeleteCategoryOperationData {
  id: string;
}

export interface ImportCategoriesOperationData {
  categories: Omit<Category, 'id' | 'user_id'>[];
  replaceIds?: string[];
}

export interface AccountOperationData {
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
  balance?: number;
  initial_balance?: number;
  color?: string;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
  id?: string; // Temporary ID for add operations
}

export interface EditAccountOperationData {
  id: string;
  updates: Partial<Account>;
}

export interface DeleteAccountOperationData {
  id: string;
}

export interface ImportAccountsOperationData {
  accounts: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>[];
}

export interface ClearAllDataOperationData {
  confirmed: boolean;
}

// União discriminada para todos os tipos de operação
export type QueuedOperationData =
  | { type: 'transaction'; data: TransactionOperationData }
  | { type: 'edit'; data: EditTransactionOperationData }
  | { type: 'delete'; data: DeleteTransactionOperationData }
  | { type: 'transfer'; data: TransferOperationData }
  | { type: 'credit_payment'; data: CreditPaymentOperationData }
  | { type: 'logout'; data: Record<string, never> }
  | { type: 'add_fixed_transaction'; data: FixedTransactionOperationData }
  | { type: 'add_installments'; data: InstallmentsOperationData }
  | { type: 'import_transactions'; data: ImportTransactionsOperationData }
  | { type: 'add_category'; data: CategoryOperationData }
  | { type: 'edit_category'; data: EditCategoryOperationData }
  | { type: 'delete_category'; data: DeleteCategoryOperationData }
  | { type: 'import_categories'; data: ImportCategoriesOperationData }
  | { type: 'add_account'; data: AccountOperationData }
  | { type: 'edit_account'; data: EditAccountOperationData }
  | { type: 'delete_account'; data: DeleteAccountOperationData }
  | { type: 'import_accounts'; data: ImportAccountsOperationData }
  | { type: 'clear_all_data'; data: ClearAllDataOperationData };

/**
 * Type guard para verificar se operação é de transação
 */
export function isTransactionOperation(
  operation: QueuedOperationData
): operation is { type: 'transaction'; data: TransactionOperationData } {
  return operation.type === 'transaction';
}

/**
 * Type guard para verificar se operação é de edição
 */
export function isEditOperation(
  operation: QueuedOperationData
): operation is { type: 'edit'; data: EditTransactionOperationData } {
  return operation.type === 'edit';
}

/**
 * Type guard para verificar se operação é de categoria
 */
export function isCategoryOperation(
  operation: QueuedOperationData
): operation is { type: 'add_category'; data: CategoryOperationData } {
  return operation.type === 'add_category';
}

/**
 * Type guard para verificar se operação é de conta
 */
export function isAccountOperation(
  operation: QueuedOperationData
): operation is { type: 'add_account'; data: AccountOperationData } {
  return operation.type === 'add_account';
}
