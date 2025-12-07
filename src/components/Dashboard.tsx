import { useSettings } from '@/context/SettingsContext';
import type { Account, Transaction, Category, AccountFilterType, TransactionFilterType, StatusFilterType, DateFilterType } from '@/types';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardCalculations } from '@/hooks/useDashboardCalculations';
import { useComponentPerformance } from '@/hooks/useComponentPerformance';
import { FilterCard } from './dashboard/FilterCard';
import { BalanceCards } from './dashboard/BalanceCards';
import { FinancialEvolutionChart } from './dashboard/FinancialEvolutionChart';
import { AccountsSummary } from './dashboard/AccountsSummary';
import { RecentTransactions } from './dashboard/RecentTransactions';

import { CardErrorBoundary } from '@/components/ui/card-error-boundary';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';

interface DashboardProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  onTransfer: () => void;
  onAddTransaction: () => void;
  onAddAccount?: () => void;
  onAddExpense?: () => void;
  onAddIncome?: () => void;
  onAddCreditExpense?: () => void;
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
}

export function Dashboard({
  accounts,
  transactions,
  onTransfer,
  onAddTransaction,
  onAddAccount,
  onAddExpense,
  onAddIncome,
  onAddCreditExpense,
  onNavigateToAccounts,
  onNavigateToTransactions,
}: DashboardProps) {
  const { formatCurrency } = useSettings();
  
  // Track performance do Dashboard
  useComponentPerformance('Dashboard', true);

  const {
    dateFilter,
    setDateFilter,
    selectedMonth,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    goToPreviousMonth,
    goToNextMonth,
    getNavigationParams,
  } = useDashboardFilters();

  const {
    totalBalance,
    creditAvailable,
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
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate
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
              creditCardExpenses={creditCardExpenses}
              pendingIncome={pendingIncome}
              pendingExpenses={pendingExpenses}
              pendingIncomeCount={pendingIncomeCount}
              pendingExpensesCount={pendingExpensesCount}
              getPeriodLabel={getPeriodLabel}
              getNavigationParams={getNavigationParams}
              onNavigateToAccounts={onNavigateToAccounts}
              onNavigateToTransactions={onNavigateToTransactions}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
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

          <ListErrorBoundary fallbackMessage="Erro ao carregar transações recentes">
            <RecentTransactions
              transactions={transactions}
              maxItems={Math.max(accounts.length, 3)}
              onNavigateToTransactions={onNavigateToTransactions}
              onAddTransaction={onAddTransaction}
            />
          </ListErrorBoundary>
        </div>
      </div>
    </div>
  );
}
