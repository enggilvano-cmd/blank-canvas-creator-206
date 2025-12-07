import { useSettings } from "@/context/SettingsContext";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatCardsSkeletonGrid } from "@/components/transactions/StatCardSkeleton";
import { TransactionTableSkeleton } from "@/components/transactions/TransactionTableSkeleton";
import { TransactionList } from "@/components/transactions/TransactionList";
import { TransactionStatsCards } from "@/components/transactions/TransactionStatsCards";
import { TransactionFiltersBar } from "@/components/transactions/TransactionFiltersBar";
import { ImportTransactionsModal } from "./ImportTransactionsModal";
import { EditScope, TransactionScopeDialog } from "./TransactionScopeDialog";
import { FixedTransactionScopeDialog, FixedScope } from "./FixedTransactionScopeDialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useTransactionsPageLogic } from "@/hooks/useTransactionsPageLogic";
import { useComponentPerformance } from "@/hooks/useComponentPerformance";
import type { Transaction, Account, Category, ImportTransactionData } from '@/types';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';

interface TransactionsPageProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onAddTransaction: () => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: string, scope?: EditScope) => void;
  onImportTransactions: (transactions: ImportTransactionData[], transactionsToReplace: string[]) => void;
  onMarkAsPaid?: (transaction: Transaction) => Promise<void>;
  totalCount: number;
  pageCount: number;
  currentPage: number;
  pageSize: number | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
  filterType: "all" | "income" | "expense" | "transfer";
  onFilterTypeChange: (type: "all" | "income" | "expense" | "transfer") => void;
  filterAccount: string;
  onFilterAccountChange: (accountId: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (categoryId: string) => void;
  filterStatus: "all" | "pending" | "completed";
  onFilterStatusChange: (status: "all" | "pending" | "completed") => void;
  filterIsFixed: string;
  onFilterIsFixedChange: (value: string) => void;
  filterIsProvision: string;
  onFilterIsProvisionChange: (value: string) => void;
  filterInvoiceMonth: string;
  onFilterInvoiceMonthChange: (value: string) => void;
  filterAccountType: string;
  onFilterAccountTypeChange: (type: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: (date: string | undefined) => void;
  onDateToChange: (date: string | undefined) => void;
  sortBy: "date" | "amount";
  onSortByChange: (sortBy: "date" | "amount") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (order: "asc" | "desc") => void;
  isLoading?: boolean;
  periodFilter: "all" | "current_month" | "month_picker" | "custom";
  onPeriodFilterChange: (value: "all" | "current_month" | "month_picker" | "custom") => void;
  selectedMonth: Date;
  onSelectedMonthChange: (date: Date) => void;
  customStartDate: Date | undefined;
  onCustomStartDateChange: (date: Date | undefined) => void;
  customEndDate: Date | undefined;
  onCustomEndDateChange: (date: Date | undefined) => void;
  allTransactions?: Transaction[];
  availableInvoiceMonths: string[];
}

export function TransactionsPage({
  transactions,
  accounts,
  categories,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onImportTransactions,
  onMarkAsPaid,
  totalCount,
  pageCount,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  search,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterAccount,
  onFilterAccountChange,
  filterCategory,
  onFilterCategoryChange,
  filterStatus,
  onFilterStatusChange,
  filterIsFixed,
  onFilterIsFixedChange,
  filterIsProvision,
  onFilterIsProvisionChange,
  filterInvoiceMonth,
  onFilterInvoiceMonthChange,
  filterAccountType,
  onFilterAccountTypeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  isLoading = false,
  periodFilter,
  onPeriodFilterChange,
  selectedMonth,
  onSelectedMonthChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  allTransactions,
  availableInvoiceMonths,
}: TransactionsPageProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const { settings, formatCurrency } = useSettings();
  
  // Track performance
  useComponentPerformance('TransactionsPage', true);

  // Use custom hook for page logic
  const {
    accountsByType,
    handleDateFilterChange,
    handleMonthChange,
    filterChips,
    clearAllFilters,
    aggregatedTotals,
    exportToExcel,
    handleDeleteWithScope,
    confirmDelete,
    scopeDialogOpen,
    setScopeDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    pendingDeleteTransaction,
    setPendingDeleteTransaction,
    pendingTransactionsCount,
    hasCompletedTransactions,
  } = useTransactionsPageLogic({
    transactions,
    accounts,
    categories,
    filterType,
    onFilterTypeChange,
    filterStatus,
    onFilterStatusChange,
    filterIsFixed,
    onFilterIsFixedChange,
    filterIsProvision,
    onFilterIsProvisionChange,
    filterInvoiceMonth,
    onFilterInvoiceMonthChange,
    filterAccountType,
    onFilterAccountTypeChange,
    filterAccount,
    onFilterAccountChange,
    filterCategory,
    onFilterCategoryChange,
    periodFilter,
    onPeriodFilterChange,
    selectedMonth,
    onSelectedMonthChange,
    customStartDate,
    customEndDate,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    search,
    onDeleteTransaction,
  });

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">
      {isLoading ? (
        <StatCardsSkeletonGrid />
      ) : (
        <TransactionStatsCards
          totalCount={totalCount}
          income={aggregatedTotals.income}
          expenses={aggregatedTotals.expenses}
          balance={aggregatedTotals.balance}
          formatCurrency={formatCurrency}
        />
      )}

      <TransactionFiltersBar
        search={search}
        onSearchChange={onSearchChange}
        sortBy={sortBy}
        onSortByChange={onSortByChange}
        sortOrder={sortOrder}
        onSortOrderChange={onSortOrderChange}
        filterType={filterType}
        onFilterTypeChange={onFilterTypeChange}
        filterStatus={filterStatus}
        onFilterStatusChange={onFilterStatusChange}
        filterIsFixed={filterIsFixed}
        onFilterIsFixedChange={onFilterIsFixedChange}
        filterIsProvision={filterIsProvision}
        onFilterIsProvisionChange={onFilterIsProvisionChange}
        filterInvoiceMonth={filterInvoiceMonth}
        onFilterInvoiceMonthChange={onFilterInvoiceMonthChange}
        filterAccountType={filterAccountType}
        onFilterAccountTypeChange={onFilterAccountTypeChange}
        filterAccount={filterAccount}
        onFilterAccountChange={onFilterAccountChange}
        filterCategory={filterCategory}
        onFilterCategoryChange={onFilterCategoryChange}
        periodFilter={periodFilter}
        onPeriodFilterChange={handleDateFilterChange}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        customStartDate={customStartDate}
        onCustomStartDateChange={onCustomStartDateChange}
        customEndDate={customEndDate}
        onCustomEndDateChange={onCustomEndDateChange}
        accountsByType={accountsByType}
        categories={categories}
        availableInvoiceMonths={availableInvoiceMonths}
        filterChips={filterChips}
        onClearAllFilters={clearAllFilters}
      />

      {/* Transactions List */}
      {isLoading ? (
        <TransactionTableSkeleton />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg sm:text-xl">
              Transações ({totalCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <ListErrorBoundary fallbackMessage="Erro ao carregar lista de transações">
              <TransactionList
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                currency={settings.currency}
                onEdit={onEditTransaction}
                onDelete={handleDeleteWithScope}
                onMarkAsPaid={onMarkAsPaid}
              />
            </ListErrorBoundary>
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls */}
      <PaginationControls
        currentPage={currentPage}
        pageCount={pageCount}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[50, 100, 200]}
      />

      <ImportTransactionsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        accounts={accounts}
        transactions={allTransactions || transactions}
        onImportTransactions={onImportTransactions}
      />

      {pendingDeleteTransaction && pendingDeleteTransaction.is_fixed && (
        <FixedTransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={(scope: FixedScope) => {
            if (pendingDeleteTransaction) {
              // Converter FixedScope para EditScope
              const editScope: EditScope =
                scope === "current"
                  ? "current"
                  : scope === "current-and-remaining"
                    ? "current-and-remaining"
                    : "all";
              onDeleteTransaction(pendingDeleteTransaction.id, editScope);
              setPendingDeleteTransaction(null);
            }
          }}
          mode="delete"
          hasCompleted={hasCompletedTransactions}
          pendingCount={pendingTransactionsCount}
        />
      )}

      {pendingDeleteTransaction && !pendingDeleteTransaction.is_fixed && (
        <TransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={(scope) => {
            if (pendingDeleteTransaction) {
              onDeleteTransaction(pendingDeleteTransaction.id, scope);
              setPendingDeleteTransaction(null);
            }
          }}
          currentInstallment={pendingDeleteTransaction.current_installment || 1}
          totalInstallments={pendingDeleteTransaction.installments || 1}
          mode="delete"
          hasCompleted={hasCompletedTransactions}
          pendingCount={pendingTransactionsCount}
        />
      )}

      {/* Delete Confirmation Dialog for Simple Transactions */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTransaction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}