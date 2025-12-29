import { useSettings } from '@/context/SettingsContext';
import type { Account, Transaction, Category, AccountFilterType, TransactionFilterType, StatusFilterType, DateFilterType } from '@/types';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardCalculations } from '@/hooks/useDashboardCalculations';
import { useComponentPerformance } from '@/hooks/useComponentPerformance';
import { FilterCard } from './FilterCard';
import { BalanceCards } from './BalanceCards';
import { FinancialEvolutionChart } from './FinancialEvolutionChart';
import { AccountsSummary } from './AccountsSummary';
import { RecentTransactions } from './RecentTransactions';
import { ProvisionedTransactionsByCategory } from './ProvisionedTransactionsByCategory';

import { CardErrorBoundary } from '@/components/ui/card-error-boundary';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardProps {
  accounts: Account[];
  transactions: Transaction[];
  fixedTransactions: Transaction[];
  categories: Category[];
  onAddTransaction: () => void;
  onAddAccount?: () => void;
  onNavigateToAccounts?: (filterType?: 'credit' | 'checking' | 'savings' | 'investment' | 'meal_voucher') => void;
  onNavigateToTransactions?: (
    filterType?: TransactionFilterType,
    filterStatus?: StatusFilterType,
    dateFilter?: DateFilterType,
    filterAccountType?: AccountFilterType,
    selectedMonth?: Date,
    customStartDate?: Date,
    customEndDate?: Date
  ) => void;
  isFetching?: boolean; // ✅ NOVO: Indicador de loading para UX
}

export function Dashboard({
  accounts,
  transactions,
  fixedTransactions,
  categories,
  onAddTransaction,
  onAddAccount,
  onNavigateToAccounts,
  onNavigateToTransactions,
  isFetching = false, // ✅ NOVO: Default false
}: DashboardProps) {
  const { formatCurrency } = useSettings();
  
  // Track performance do Dashboard
  useComponentPerformance('Dashboard', true);

  // Usar um key derivado das transações para forçar re-render do hook
  // Isso garante que useDashboardCalculations será re-executado quando há novas transações
  const transactionsKey = useMemo(() => transactions.length.toString(), [transactions.length]);

  const {
    dateFilter,
    setDateFilter,
    selectedMonth,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getDateRange, // ✅ NOVO: função centralizada
    goToPreviousMonth,
    goToNextMonth,
    getNavigationParams,
  } = useDashboardFilters();

  // ✅ MELHORADO: Usar getDateRange centralizado (sem duplicação)
  const dateRange = useMemo(() => getDateRange(), [getDateRange]);

  const {
    totalBalance,
    creditAvailable,
    creditLimitUsed,
    periodIncome,
    periodExpenses,
    creditCardExpenses,
    pendingExpenses,
    pendingIncome,
    pendingExpensesCount,
    pendingIncomeCount,
    getPeriodLabel,
  } = useDashboardCalculations(
    accounts,
    dateRange, // ✅ MELHORADO: Passa dateRange ao invés de filtros individuais
    transactionsKey,
    transactions,
    fixedTransactions,
    dateFilter, // Para getPeriodLabel
    selectedMonth, // Para getPeriodLabel
    customStartDate, // Para getPeriodLabel
    customEndDate // Para getPeriodLabel
  );

  return (
    <div className="space-y-3 sm:space-y-4 fade-in max-w-screen-2xl mx-auto px-2 sm:px-0 pb-6 sm:pb-8 spacing-responsive-md">
      <div className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="col-span-2 sm:col-span-1">
            <FilterCard
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
              selectedMonth={selectedMonth}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              customEndDate={customEndDate}
              setCustomEndDate={setCustomEndDate}
              goToPreviousMonth={goToPreviousMonth}
              goToNextMonth={goToNextMonth}
            />
          </div>

          <CardErrorBoundary fallbackMessage="Erro ao carregar saldos">
            <BalanceCards
              formatCurrency={formatCurrency}
              totalBalance={totalBalance}
              periodIncome={periodIncome}
              periodExpenses={periodExpenses}
              creditAvailable={creditAvailable}
              creditLimitUsed={creditLimitUsed}
              creditCardExpenses={creditCardExpenses}
              pendingIncome={pendingIncome}
              pendingExpenses={pendingExpenses}
              pendingIncomeCount={pendingIncomeCount}
              pendingExpensesCount={pendingExpensesCount}
              getPeriodLabel={getPeriodLabel}
              getNavigationParams={getNavigationParams}
              onNavigateToAccounts={onNavigateToAccounts}
              onNavigateToTransactions={onNavigateToTransactions}
              isFetching={isFetching}
            />
          </CardErrorBoundary>
        </div>


        <CardErrorBoundary fallbackMessage="Erro ao carregar gráfico">
          <FinancialEvolutionChart
            transactions={transactions}
            accounts={accounts}
            dateFilter={dateFilter}
            selectedMonth={selectedMonth}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
          />
        </CardErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <CardErrorBoundary fallbackMessage="Erro ao carregar contas">
            <AccountsSummary
              accounts={accounts}
              accountTypes={['checking', 'savings', 'investment', 'meal_voucher']}
              title="Suas Contas"
              emptyMessage="Nenhuma conta cadastrada"
              onNavigateToAccounts={onNavigateToAccounts}
              onAddAccount={onAddAccount}
            />
          </CardErrorBoundary>

          <CardErrorBoundary fallbackMessage="Erro ao carregar cartões">
            <AccountsSummary
              accounts={accounts}
              accountTypes={['credit']}
              title="Seus Cartões"
              emptyMessage="Nenhum cartão cadastrado"
              onNavigateToAccounts={() => onNavigateToAccounts?.('credit')}
              onAddAccount={onAddAccount}
            />
          </CardErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <CardErrorBoundary fallbackMessage="Erro ao carregar receitas provisionadas">
            <ProvisionedTransactionsByCategory
              transactions={transactions}
              fixedTransactions={fixedTransactions}
              categories={categories}
              type="income"
              dateFrom={dateRange.dateFrom}
              dateTo={dateRange.dateTo}
            />
          </CardErrorBoundary>

          <CardErrorBoundary fallbackMessage="Erro ao carregar despesas provisionadas">
            <ProvisionedTransactionsByCategory
              transactions={transactions}
              fixedTransactions={fixedTransactions}
              categories={categories}
              type="expense"
              dateFrom={dateRange.dateFrom}
              dateTo={dateRange.dateTo}
            />
          </CardErrorBoundary>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          <ListErrorBoundary fallbackMessage="Erro ao carregar transações recentes">
            <RecentTransactions
              key={`recent-transactions-${transactions.length}-${transactions[0]?.id || 'empty'}`}
              transactions={transactions}
              maxItems={Math.max(accounts.length, 10)}
              onNavigateToTransactions={onNavigateToTransactions}
              onAddTransaction={onAddTransaction}
            />
          </ListErrorBoundary>
        </div>
      </div>
    </div>
  );
}
