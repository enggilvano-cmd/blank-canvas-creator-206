/**
 * Tipos dedicados para props de componentes de formulário
 * Garante type safety e consistência nas interfaces dos modais
 */

import { Transaction, Account, Category, TransactionInput, InstallmentTransactionInput, TransactionUpdate } from "./index";
import {
  AddAccountFormData,
  EditAccountFormData,
  AddCategoryFormData,
  EditCategoryFormData,
  AddTransactionFormData,
  EditTransactionFormData,
  TransferFormData,
  CreditPaymentFormData,
  MarkAsPaidFormData,
} from "@/lib/validationSchemas";

// ============= Base Modal Props =============

export interface BaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============= Account Modal Props =============

export interface AddAccountModalProps extends BaseModalProps {}

export interface EditAccountModalProps extends BaseModalProps {
  account: Account | null;
  onEditAccount: (account: Partial<Account> & { id: string }) => Promise<void>;
}

// ============= Category Modal Props =============

export interface AddCategoryModalProps extends BaseModalProps {
  onAddCategory: (category: Omit<Category, "id">) => void;
}

export interface EditCategoryModalProps extends BaseModalProps {
  category: Category | null;
  onEditCategory: (category: Partial<Category> & { id: string }) => void;
}

// ============= Transaction Modal Props =============

export interface AddTransactionModalProps extends BaseModalProps {
  accounts: Account[];
  onAddTransaction: (transaction: TransactionInput) => Promise<void>;
  onAddInstallmentTransactions?: (
    transactions: InstallmentTransactionInput[]
  ) => Promise<void>;
  onSuccess?: () => void;
  initialType?: "income" | "expense" | "";
  initialAccountType?: "credit" | "checking" | "";
  lockType?: boolean;
}

export interface EditTransactionModalProps extends BaseModalProps {
  transaction: Transaction | null;
  accounts: Account[];
  onEditTransaction: (
    transaction: TransactionUpdate,
    editScope?: "current" | "current-and-remaining" | "all"
  ) => void;
}

export interface TransferModalProps extends BaseModalProps {
  onTransfer: (
    fromAccountId: string,
    toAccountId: string,
    amountInCents: number,
    date: Date
  ) => Promise<{ fromAccount: Account; toAccount: Account }>;
}

// ============= Credit Payment Modal Props =============

export interface CreditPaymentModalProps extends BaseModalProps {
  onPayment: (params: {
    creditCardAccountId: string;
    debitAccountId: string;
    amount: number;
    paymentDate: string;
    invoiceMonth?: string;
  }) => Promise<{
    updatedCreditAccount: Account;
    updatedDebitAccount: Account;
  }>;
  creditAccount: Account | null;
  invoiceValueInCents: number;
  nextInvoiceValueInCents: number;
  totalDebtInCents: number;
  invoiceMonth?: string;
}

// ============= Mark as Paid Modal Props =============

export interface MarkAsPaidModalProps extends BaseModalProps {
  transaction: Transaction | null;
  accounts: Account[];
  onConfirm: (
    transactionId: string,
    date: Date,
    amount: number,
    accountId: string,
    invoiceMonth?: string
  ) => void;
}

// ============= Re-export Form Data Types =============

export type {
  AddAccountFormData,
  EditAccountFormData,
  AddCategoryFormData,
  EditCategoryFormData,
  AddTransactionFormData,
  EditTransactionFormData,
  TransferFormData,
  CreditPaymentFormData,
  MarkAsPaidFormData,
};
