import { useMemo } from 'react';
import type { Account, Transaction, DateFilterType } from '@/types';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createDateFromString } from '@/lib/dateUtils';

export type ChartScaleType = 'daily' | 'monthly';

export function useDashboardChartData(
  transactions: Transaction[],
  accounts: Account[],
  chartScale: ChartScaleType,
  chartYear: number,
  dateFilter: DateFilterType,
  selectedMonth: Date,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined
) {
  return useMemo(() => {
    const isTransferLike = (t: Transaction) =>
      t.type === 'transfer' || Boolean((t as any).to_account_id) || Boolean((t as any).linked_transaction_id);

    const isProvision = (t: Transaction) => t.is_provision && t.amount > 0;

    // Helper to calculate balance at the START of a specific date
    // Anchored to the current actual balance from accounts
    const calculateBalanceAtStartOfDate = (targetDate: Date) => {
      // 1. Start with the current actual balance (sum of all accounts)
      // This includes the effect of all COMPLETED transactions up to now
      const currentTotalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      
      const targetDateStr = format(targetDate, 'yyyy-MM-dd');

      // 2. Subtract COMPLETED transactions that happened ON or AFTER the target date
      // We are moving backwards in time, so we reverse the effect of these transactions
      const completedSinceTarget = transactions.filter(t => {
        if (isTransferLike(t)) return false;
        if (t.status !== 'completed') return false;
        
        const tDate = typeof t.date === 'string' ? createDateFromString(t.date) : t.date;
        const tDateStr = format(tDate, 'yyyy-MM-dd');
        
        // Include transactions on the target date itself because we want the balance at the START of that day
        return tDateStr >= targetDateStr;
      });
      
      const netChangeSinceTarget = completedSinceTarget.reduce((acc, t) => {
        if (t.type === 'income') return acc + Math.abs(t.amount);
        if (t.type === 'expense') return acc - Math.abs(t.amount);
        return acc;
      }, 0);
      
      // 3. Add PENDING transactions that happened BEFORE the target date
      // These are "debts" or "receivables" that should have affected the balance by that time
      // if we are projecting a "real" balance including pending items
      const pendingBeforeTarget = transactions.filter(t => {
        if (isTransferLike(t)) return false;
        if (t.status !== 'pending') return false;
        
        const tDate = typeof t.date === 'string' ? createDateFromString(t.date) : t.date;
        const tDateStr = format(tDate, 'yyyy-MM-dd');

        return tDateStr < targetDateStr;
      });
      
      const netPendingBeforeTarget = pendingBeforeTarget.reduce((acc, t) => {
        if (t.type === 'income') return acc + Math.abs(t.amount);
        if (t.type === 'expense') return acc - Math.abs(t.amount);
        return acc;
      }, 0);
      
      // Formula: Balance(Start) = Current - (Completed >= Start) + (Pending < Start)
      return currentTotalBalance - netChangeSinceTarget + netPendingBeforeTarget;
    };

    if (chartScale === 'daily') {
      let dailyFilteredTrans = transactions;
      let startDate: Date;

      if (dateFilter === 'current_month') {
        const now = new Date();
        startDate = startOfMonth(now);
        const end = endOfMonth(now);
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, { start: startDate, end });
        });
      } else if (dateFilter === 'month_picker') {
        startDate = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, { start: startDate, end });
        });
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        startDate = customStartDate;
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, {
            start: customStartDate,
            end: customEndDate,
          });
        });
      } else {
        // Fallback for 'all' or undefined
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      }

      if (dailyFilteredTrans.length === 0) return [];

      const dailyTotals = dailyFilteredTrans
        .filter(t => !isTransferLike(t)) // Excluir transferências
        .reduce((acc, transaction) => {
        const transactionDate = typeof transaction.date === 'string'
          ? createDateFromString(transaction.date)
          : transaction.date;
        const dateKey = format(transactionDate, 'yyyy-MM-dd');

        if (!acc[dateKey]) {
          acc[dateKey] = { income: 0, expenses: 0 };
        }

        if (transaction.type === 'income') {
          acc[dateKey].income += transaction.amount;
        } else if (transaction.type === 'expense') {
          acc[dateKey].expenses += Math.abs(transaction.amount);
        }

        return acc;
      }, {} as Record<string, { income: number; expenses: number }>);

      const sortedEntries = Object.entries(dailyTotals).sort(([a], [b]) =>
        a.localeCompare(b)
      );

      // Calculate initial balance based on the start date of the view
      // This ensures consistency with the current account balance
      const saldoInicial = calculateBalanceAtStartOfDate(startDate);

      let saldoAcumulado = saldoInicial;
      
      return sortedEntries.map(([dateKey, data]) => {
        saldoAcumulado = saldoAcumulado + data.income - data.expenses;
        const [year, month, day] = dateKey.split('-').map((num) => parseInt(num, 10));
        return {
          month: format(new Date(year, month - 1, day), 'dd/MM', {
            locale: ptBR,
          }),
          receitas: data.income,
          despesas: data.expenses,
          saldo: saldoAcumulado,
        };
      });
    } else {
      // Monthly Scale
      const monthlyTotals = transactions
        .filter(t => !isTransferLike(t)) // Excluir transferências
        .reduce((acc, transaction) => {
        const transactionDate = typeof transaction.date === 'string'
          ? createDateFromString(transaction.date)
          : transaction.date;
        const transactionYear = transactionDate.getFullYear();

        if (transactionYear === chartYear) {
          const monthKey = format(transactionDate, 'yyyy-MM');

          if (!acc[monthKey]) {
            acc[monthKey] = { income: 0, expenses: 0 };
          }

          if (transaction.type === 'income') {
            acc[monthKey].income += transaction.amount;
          } else if (transaction.type === 'expense') {
            acc[monthKey].expenses += Math.abs(transaction.amount);
          }
        }

        return acc;
      }, {} as Record<string, { income: number; expenses: number }>);

      const monthsToShow: string[] = [];
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${chartYear}-${m.toString().padStart(2, '0')}`;
        monthsToShow.push(monthKey);
      }

      // Calculate initial balance at the start of the chart year
      const startOfYear = new Date(chartYear, 0, 1);
      const saldoInicial = calculateBalanceAtStartOfDate(startOfYear);

      let saldoAcumulado = saldoInicial;
      
      return monthsToShow.map((monthKey) => {
        const data = monthlyTotals[monthKey] || { income: 0, expenses: 0 };
        const saldoMensal = data.income - data.expenses;
        saldoAcumulado += saldoMensal;

        const [year, month] = monthKey.split('-').map((num) => parseInt(num, 10));

        return {
          month: format(new Date(year, month - 1, 1), 'MMM', { locale: ptBR }),
          receitas: data.income,
          despesas: data.expenses,
          saldo: saldoAcumulado,
          income: data.income,
          expenses: data.expenses,
          balance: saldoAcumulado,
        };
      });
    }
  }, [
    transactions,
    accounts,
    chartScale,
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    chartYear,
  ]);
}
