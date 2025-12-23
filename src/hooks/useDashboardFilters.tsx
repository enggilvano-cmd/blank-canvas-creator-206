import { useCallback } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import type { DateFilterType } from '@/types';
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

  // ✅ CENTRALIZADO: Cálculo de dateRange para evitar duplicação
  // Usado por useDashboardCalculations e componentes que precisam do intervalo
  const getDateRange = useCallback(() => {
    if (dateFilter === 'all') {
      return { dateFrom: undefined, dateTo: undefined };
    } else if (dateFilter === 'current_month') {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'month_picker') {
      return {
        dateFrom: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(selectedMonth), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return {
        dateFrom: format(customStartDate, 'yyyy-MM-dd'),
        dateTo: format(customEndDate, 'yyyy-MM-dd'),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [dateFilter, selectedMonth, customStartDate, customEndDate]);

  const goToPreviousMonth = useCallback(() => {
    setSelectedMonth((prev) => subMonths(prev, 1));
  }, [setSelectedMonth]);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((prev) => addMonths(prev, 1));
  }, [setSelectedMonth]);

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
    getDateRange, // ✅ NOVO: Centralizado para evitar duplicação
    goToPreviousMonth,
    goToNextMonth,
    getNavigationParams,
  };
}
