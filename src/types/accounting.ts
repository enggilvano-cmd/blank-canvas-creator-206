/**
 * Tipos para relatórios contábeis e journal entries
 */

export interface JournalEntry {
  id: string;
  account_id: string;
  amount: number;
  entry_type: 'debit' | 'credit';
  description: string;
  entry_date: string;
  transaction_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'contra_asset' | 'contra_liability';
  nature: 'debit' | 'credit';
  parent_id: string | null;
  is_active: boolean;
  description: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AccountingReport {
  startDate: Date;
  endDate: Date;
  generatedAt: Date;
}

export interface DREReport extends AccountingReport {
  revenue: {
    accounts: Array<{ name: string; amount: number }>;
    total: number;
  };
  expenses: {
    accounts: Array<{ name: string; amount: number }>;
    total: number;
  };
  netProfit: number;
}

export interface BalanceSheetReport extends AccountingReport {
  assets: {
    current: Array<{ name: string; amount: number }>;
    nonCurrent: Array<{ name: string; amount: number }>;
    total: number;
  };
  liabilities: {
    current: Array<{ name: string; amount: number }>;
    nonCurrent: Array<{ name: string; amount: number }>;
    total: number;
  };
  equity: {
    items: Array<{ name: string; amount: number }>;
    total: number;
  };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

export interface CashFlowReport extends AccountingReport {
  operating: {
    items: Array<{ description: string; amount: number }>;
    total: number;
  };
  investing: {
    items: Array<{ description: string; amount: number }>;
    total: number;
  };
  financing: {
    items: Array<{ description: string; amount: number }>;
    total: number;
  };
  netChange: number;
  openingBalance: number;
  closingBalance: number;
}
