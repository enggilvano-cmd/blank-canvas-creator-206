/**
 * Tipos para funções de exportação
 */

export interface ExportAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
  balance: number;
  limit_amount?: number | null;
  closing_date?: number | null;
  due_date?: number | null;
  color: string;
  created_at?: string;
}

export interface ExportCategory {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  color: string;
  created_at?: string;
}

export interface ExportTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  status: 'pending' | 'completed';
  account_id: string;
  category_id?: string | null;
  to_account_id?: string | null;
  linked_transaction_id?: string | null;
  installments?: number | null;
  current_installment?: number | null;
  invoice_month?: string | null;
  is_fixed?: boolean | null;
  is_provision?: boolean | null;
  parent_transaction_id?: string | null;
  created_at?: string;
}

export interface NotificationAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
  balance: number;
  limit_amount?: number | null;
  due_date?: number | null;
  closing_date?: number | null;
}

export interface ChartDataItem {
  name: string;
  value: number;
  percentage?: number;
  [key: string]: string | number | undefined;
}
