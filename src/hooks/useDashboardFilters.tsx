import { useCallback } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import type { Transaction, DateFilterType } from '@/types';
import { createDateFromString } from '@/lib/dateUtils';
import { usePersistedFilters } from './usePersistedFilters';

interface DashboardFiltersState {
  dateFilter: DateFilterType;
  selectedMonth: string; // ISO string for serialization
  customStartDate?: string;
  customEndDate?: string;
}

export function useDashboardFilters() {
  const [filters, setFilters] = usePersistedFilters<DashboardFiltersState>(
    'dashboard-filters',
    {
      dateFilter: 'current_month',
      selectedMonth: new Date().toISOString(),
      customStartDate: undefined,
      customEndDate: undefined,
    }
  );

  const dateFilter = filters.dateFilter;
  const selectedMonth = new Date(filters.selectedMonth);
  const customStartDate = filters.customStartDate ? new Date(filters.customStartDate) : undefined;
  const customEndDate = filters.customEndDate ? new Date(filters.customEndDate) : undefined;

  const setDateFilter = useCallback((value: DateFilterType) => {
    setFilters((prev) => ({ ...prev, dateFilter: value }));
  }, [setFilters]);

  const setSelectedMonth = useCallback((value: Date | ((prev: Date) => Date)) => {
    setFilters((prev) => ({
      ...prev,
      selectedMonth: typeof value === 'function' 
        ? value(new Date(prev.selectedMonth)).toISOString()
        : value.toISOString(),
    }));
  }, [setFilters]);

  const setCustomStartDate = useCallback((value: Date | undefined) => {
    setFilters((prev) => ({
      ...prev,
      customStartDate: value?.toISOString(),
    }));
  }, [setFilters]);

  const setCustomEndDate = useCallback((value: Date | undefined) => {
    setFilters((prev) => ({
      ...prev,
      customEndDate: value?.toISOString(),
    }));
  }, [setFilters]);

  const getFilteredTransactions = useCallback((transactions: Transaction[]) => {
    let filtered = transactions;

    if (dateFilter === 'current_month') {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      filtered = filtered.filter((t) => {
        const transactionDate = typeof t.date === 'string' 
          ? createDateFromString(t.date) 
          : t.date;
        return isWithinInterval(transactionDate, { start, end });
      });
    } else if (dateFilter === 'month_picker') {
      const start = startOfMonth(selectedMonth);
      const end = endOfMonth(selectedMonth);
      filtered = filtered.filter((t) => {
        const transactionDate = typeof t.date === 'string' 
          ? createDateFromString(t.date) 
          : t.date;
        return isWithinInterval(transactionDate, { start, end });
      });
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      filtered = filtered.filter((t) => {
        const transactionDate = typeof t.date === 'string' 
          ? createDateFromString(t.date) 
          : t.date;
        return isWithinInterval(transactionDate, {
          start: customStartDate,
          end: customEndDate,
        });
      });
    }

    return filtered;
  }, [dateFilter, selectedMonth, customStartDate, customEndDate]);

  const goToPreviousMonth = useCallback(() => {
    setSelectedMonth((prev) => subMonths(prev, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((prev) => addMonths(prev, 1));
  }, []);

  const getNavigationParams = useCallback(() => {
    if (dateFilter === 'current_month') {
      return {
        dateFilter: 'current_month' as const,
        selectedMonth: undefined,
        customStartDate: undefined,
        customEndDate: undefined,
      };
    } else if (dateFilter === 'month_picker') {
      return {
        dateFilter: 'month_picker' as const,
        selectedMonth,
        customStartDate: undefined,
        customEndDate: undefined,
      };
    } else if (dateFilter === 'custom') {
      return {
        dateFilter: 'custom' as const,
        selectedMonth: undefined,
        customStartDate,
        customEndDate,
      };
    }
    return {
      dateFilter: 'all' as const,
      selectedMonth: undefined,
      customStartDate: undefined,
      customEndDate: undefined,
    };
  }, [dateFilter, selectedMonth, customStartDate, customEndDate]);

  return {
    dateFilter,
    setDateFilter,
    selectedMonth,
    setSelectedMonth,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getFilteredTransactions,
    goToPreviousMonth,
    goToNextMonth,
    getNavigationParams,
  };
}
