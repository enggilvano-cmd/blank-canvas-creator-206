import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Clock, Wallet } from 'lucide-react';
import type { NavigationParams, AccountFilterType, TransactionFilterType, StatusFilterType, DateFilterType } from '@/types';

interface BalanceCardsProps {
  formatCurrency: (value: number) => string;
  totalBalance: number;
  periodIncome: number;
  periodExpenses: number;
  creditAvailable: number;
  creditCardExpenses: number;
  pendingIncome: number;
  pendingExpenses: number;
  pendingIncomeCount: number;
  pendingExpensesCount: number;
  getPeriodLabel: () => string;
  getNavigationParams: () => NavigationParams;
  onNavigateToAccounts?: (filterType?: 'credit') => void;
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

export function BalanceCards({
  formatCurrency,
  totalBalance,
  periodIncome,
  periodExpenses,
  creditAvailable,
  creditCardExpenses,
  pendingIncome,
  pendingExpenses,
  pendingIncomeCount,
  pendingExpensesCount,
  getPeriodLabel,
  getNavigationParams,
  onNavigateToAccounts,
  onNavigateToTransactions,
}: BalanceCardsProps) {
  return (
    <>
      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform col-span-2 sm:col-span-1"
        onClick={() => onNavigateToAccounts?.()}
        role="button"
        tabIndex={0}
        aria-label={`Saldo Total: ${formatCurrency(totalBalance)}. Clique para ver contas`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Saldo Total
          </p>
          <div
            className={`balance-text ${
              totalBalance >= 0 ? 'balance-positive' : 'balance-negative'
            }`}
          >
            {formatCurrency(totalBalance)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            Corrente • Poupança
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => {
          const params = getNavigationParams();
          onNavigateToTransactions?.(
            'income',
            'all',
            params.dateFilter,
            'all',
            params.selectedMonth,
            params.customStartDate,
            params.customEndDate
          );
        }}
        role="button"
        tabIndex={0}
        aria-label={`Receitas do Mês: ${formatCurrency(periodIncome)}. Clique para ver todas as receitas`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Receitas
          </p>
          <div className="balance-text balance-positive">
            {formatCurrency(periodIncome)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            {getPeriodLabel()}
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => {
          const params = getNavigationParams();
          onNavigateToTransactions?.(
            'expense',
            'all',
            params.dateFilter,
            'all',
            params.selectedMonth,
            params.customStartDate,
            params.customEndDate
          );
        }}
        role="button"
        tabIndex={0}
        aria-label={`Despesas do Mês: ${formatCurrency(periodExpenses)}. Clique para ver todas as despesas`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Despesas
          </p>
          <div className="balance-text balance-negative">
            {formatCurrency(periodExpenses)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            {getPeriodLabel()}
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => onNavigateToAccounts?.('credit')}
        role="button"
        tabIndex={0}
        aria-label={`Crédito Disponível: ${formatCurrency(creditAvailable)}. Clique para ver cartões`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Crédito Disponível
          </p>
          <div className="balance-text text-primary">
            {formatCurrency(creditAvailable)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            Limite do Cartão
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => {
          const params = getNavigationParams();
          onNavigateToTransactions?.(
            'expense',
            'all',
            params.dateFilter,
            'credit',
            params.selectedMonth,
            params.customStartDate,
            params.customEndDate
          );
        }}
        role="button"
        tabIndex={0}
        aria-label={`Despesas no Cartão: ${formatCurrency(creditCardExpenses)}. Clique para ver detalhes`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-warning/10 flex items-center justify-center">
              <CreditCard className="h-3.5 w-3.5 text-warning" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Despesas no Cartão
          </p>
          <div className="balance-text text-warning">
            {formatCurrency(creditCardExpenses)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            {getPeriodLabel()}
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => {
          const params = getNavigationParams();
          onNavigateToTransactions?.(
            'income',
            'pending',
            params.dateFilter,
            'all',
            params.selectedMonth,
            params.customStartDate,
            params.customEndDate
          );
        }}
        role="button"
        tabIndex={0}
        aria-label={`Receitas Pendentes: ${formatCurrency(pendingIncome)}. Clique para ver detalhes`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-success" />
            </div>
            {pendingIncomeCount > 0 && (
              <div className="flex items-center justify-center min-w-[30px] h-[30px] px-2 rounded-full bg-success text-white">
                <span className="text-base font-bold">{pendingIncomeCount}</span>
              </div>
            )}
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Receitas Pendentes
          </p>
          <div className="balance-text text-success">
            {formatCurrency(pendingIncome)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            {getPeriodLabel()}
          </p>
        </CardContent>
      </Card>

      <Card
        className="financial-card cursor-pointer apple-interaction hover:scale-[1.02] transition-transform"
        onClick={() => {
          const params = getNavigationParams();
          onNavigateToTransactions?.(
            'expense',
            'pending',
            params.dateFilter,
            'all',
            params.selectedMonth,
            params.customStartDate,
            params.customEndDate
          );
        }}
        role="button"
        tabIndex={0}
        aria-label={`Despesas Pendentes: ${formatCurrency(pendingExpenses)}. Clique para ver detalhes`}
      >
        <CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-destructive" />
            </div>
            {pendingExpensesCount > 0 && (
              <div className="flex items-center justify-center min-w-[30px] h-[30px] px-2 rounded-full bg-destructive text-white">
                <span className="text-base font-bold">{pendingExpensesCount}</span>
              </div>
            )}
          </div>
          <p className="text-caption text-muted-foreground mb-1">
            Despesas Pendentes
          </p>
          <div className="balance-text text-destructive">
            {formatCurrency(pendingExpenses)}
          </div>
          <p className="text-caption text-muted-foreground mt-1 opacity-70">
            {getPeriodLabel()}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
