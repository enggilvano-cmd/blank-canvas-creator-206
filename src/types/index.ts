// Shared types across the application
export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  color: string;
  user_id?: string;
}

export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance: number;
  initial_balance?: number | null;
  limit_amount?: number | null;
  due_date?: number | null;
  closing_date?: number | null;
  color: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreditBill {
  id: string;
  account_id: string;
  billing_cycle: string;
  due_date: Date;
  closing_date: Date;
  total_amount: number;
  paid_amount: number;
  status: "pending" | "paid" | "overdue" | "partial";
  minimum_payment: number;
  late_fee: number;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "income" | "expense" | "transfer";
  category_id: string;
  account_id: string;
  status: "pending" | "completed";
  user_id?: string;
  to_account_id?: string | null; // For transfers
  installments?: number | null; // Number of installments for installment transactions
  current_installment?: number | null; // Current installment number (1-based)
  parent_transaction_id?: string | null; // ID linking installment transactions together
  linked_transaction_id?: string | null; // Para vincular pagamentos/transferências
  invoice_month?: string | null; // Month of credit card invoice (YYYY-MM)
  invoice_month_overridden?: boolean | null; // True when user manually sets invoice month
  is_fixed?: boolean | null;
  is_recurring?: boolean | null;
  is_provision?: boolean | null;
  created_at?: string;
  updated_at?: string;
  // Relations from JOINs
  category?: {
    id: string;
    name: string;
    type: "income" | "expense" | "both";
    color: string;
  } | null;
  account?: {
    id: string;
    name: string;
    type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
    color: string;
  } | null;
  to_account?: {
    id: string;
    name: string;
    type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
    color: string;
  } | null;
  linked_transactions?: {
    account_id: string;
    accounts?: {
      id: string;
      name: string;
      type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
      color: string;
    } | null;
  } | null;
}

// Para o store, garantindo que a data seja um objeto Date
export interface AppTransaction extends Omit<Transaction, 'date'> {
  date: Date;
}

export const PREDEFINED_COLORS = [
  "#ef4444", // red
  "#f97316", // orange  
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#6b7280", // gray
];

export const ACCOUNT_TYPE_LABELS = {
  checking: "Conta Corrente",
  savings: "Poupança", 
  credit: "Cartão de Crédito",
  investment: "Investimento",
  meal_voucher: "Vale Refeição/Alimentação"
} as const;

// Input types for transaction operations
export interface TransactionInput {
  description: string;
  amount: number;
  date: Date;
  type: "income" | "expense" | "transfer";
  category_id: string;
  account_id: string;
  status: "pending" | "completed";
  invoiceMonth?: string | null;
}

export interface InstallmentTransactionInput extends TransactionInput {
  currentInstallment?: number;
  invoiceMonthOverridden?: boolean;
}

export interface TransactionUpdate {
  id: string;
  description?: string;
  amount?: number;
  date?: Date | string;
  type?: "income" | "expense" | "transfer";
  category_id?: string;
  account_id?: string;
  status?: "pending" | "completed";
  invoice_month?: string | null;
}

export interface ImportTransactionData {
  description: string;
  amount: number;
  date: string;
  type: "income" | "expense" | "transfer";
  category?: string;
  account_id: string;
  to_account_id?: string;
  status?: "pending" | "completed";
  installments?: number;
  current_installment?: number;
  invoice_month?: string;
  is_fixed?: boolean;
  is_provision?: boolean;
}

export interface ImportAccountData {
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance?: number;
  color?: string;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
}

export interface ImportCategoryData {
  name: string;
  type: "income" | "expense" | "both";
  color: string;
}

// Navigation parameters type for dashboard
export type DateFilterType = 'all' | 'current_month' | 'month_picker' | 'custom';

export interface NavigationParams {
  dateFilter: DateFilterType;
  selectedMonth?: Date;
  customStartDate?: Date;
  customEndDate?: Date;
}

export type AccountFilterType = 'all' | 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
export type TransactionFilterType = 'all' | 'income' | 'expense' | 'transfer';
export type StatusFilterType = 'all' | 'pending' | 'completed';