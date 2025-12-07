import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import type { Transaction } from '@/types';

describe('useDashboardFilters', () => {
  const createMockTransaction = (overrides?: Partial<Transaction>): Transaction => ({
    id: 'test-tx-id',
    description: 'Test Transaction',
    amount: 10000,
    date: '2025-01-15',
    type: 'expense',
    status: 'completed',
    account_id: 'test-account-id',
    category_id: 'test-category-id',
    user_id: 'test-user',
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
    installments: undefined,
    current_installment: undefined,
    parent_transaction_id: undefined,
    is_fixed: false,
    to_account_id: undefined,
    linked_transaction_id: undefined,
    invoice_month: undefined,
    invoice_month_overridden: false,
    ...overrides,
  });

  describe('Initial state', () => {
    it('should initialize with current_month filter', () => {
      const { result } = renderHook(() => useDashboardFilters());

      expect(result.current.dateFilter).toBe('current_month');
      expect(result.current.selectedMonth).toBeInstanceOf(Date);
      expect(result.current.customStartDate).toBeUndefined();
      expect(result.current.customEndDate).toBeUndefined();
    });
  });

  describe('Filter transactions - current_month', () => {
    it('should filter transactions for current month', () => {
      const { result } = renderHook(() => useDashboardFilters());
      
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      const transactions = [
        createMockTransaction({ date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15` }),
        createMockTransaction({ date: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-15` }),
        createMockTransaction({ date: `${currentYear - 1}-12-15` }),
      ];

      const filtered = result.current.getFilteredTransactions(transactions);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].date).toBe(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`);
    });
  });

  describe('Filter transactions - month_picker', () => {
    it('should filter transactions for selected month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const selectedDate = new Date(2025, 0, 1); // January 2025
      
      act(() => {
        result.current.setDateFilter('month_picker');
        result.current.setSelectedMonth(selectedDate);
      });

      const transactions = [
        createMockTransaction({ date: '2025-01-15' }),
        createMockTransaction({ date: '2025-02-15' }),
        createMockTransaction({ date: '2024-12-15' }),
      ];

      const filtered = result.current.getFilteredTransactions(transactions);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].date).toBe('2025-01-15');
    });
  });

  describe('Filter transactions - custom', () => {
    it('should filter transactions for custom date range', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const startDate = new Date(2025, 0, 1); // Jan 1, 2025
      const endDate = new Date(2025, 0, 31); // Jan 31, 2025
      
      act(() => {
        result.current.setDateFilter('custom');
        result.current.setCustomStartDate(startDate);
        result.current.setCustomEndDate(endDate);
      });

      const transactions = [
        createMockTransaction({ date: '2025-01-15' }),
        createMockTransaction({ date: '2025-02-15' }),
        createMockTransaction({ date: '2024-12-15' }),
      ];

      const filtered = result.current.getFilteredTransactions(transactions);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].date).toBe('2025-01-15');
    });

    it('should return all transactions if custom dates not set', () => {
      const { result } = renderHook(() => useDashboardFilters());

      act(() => {
        result.current.setDateFilter('custom');
      });

      const transactions = [
        createMockTransaction({ date: '2025-01-15' }),
        createMockTransaction({ date: '2025-02-15' }),
      ];

      const filtered = result.current.getFilteredTransactions(transactions);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('Filter transactions - all', () => {
    it('should return all transactions when filter is "all"', () => {
      const { result } = renderHook(() => useDashboardFilters());

      act(() => {
        result.current.setDateFilter('all');
      });

      const transactions = [
        createMockTransaction({ date: '2025-01-15' }),
        createMockTransaction({ date: '2024-06-15' }),
        createMockTransaction({ date: '2023-12-15' }),
      ];

      const filtered = result.current.getFilteredTransactions(transactions);

      expect(filtered).toHaveLength(3);
    });
  });

  describe('Month navigation', () => {
    it('should navigate to previous month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const initialMonth = result.current.selectedMonth;
      
      act(() => {
        result.current.goToPreviousMonth();
      });

      const newMonth = result.current.selectedMonth;
      expect(newMonth.getMonth()).toBe((initialMonth.getMonth() - 1 + 12) % 12);
    });

    it('should navigate to next month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const initialMonth = result.current.selectedMonth;
      
      act(() => {
        result.current.goToNextMonth();
      });

      const newMonth = result.current.selectedMonth;
      expect(newMonth.getMonth()).toBe((initialMonth.getMonth() + 1) % 12);
    });
  });

  describe('Navigation parameters', () => {
    it('should return correct params for current_month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const params = result.current.getNavigationParams();

      expect(params.dateFilter).toBe('current_month');
      expect(params.selectedMonth).toBeUndefined();
      expect(params.customStartDate).toBeUndefined();
      expect(params.customEndDate).toBeUndefined();
    });

    it('should return correct params for month_picker', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const selectedDate = new Date(2025, 0, 1);
      
      act(() => {
        result.current.setDateFilter('month_picker');
        result.current.setSelectedMonth(selectedDate);
      });

      const params = result.current.getNavigationParams();

      expect(params.dateFilter).toBe('month_picker');
      expect(params.selectedMonth).toEqual(selectedDate);
      expect(params.customStartDate).toBeUndefined();
      expect(params.customEndDate).toBeUndefined();
    });

    it('should return correct params for custom', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const startDate = new Date(2025, 0, 1);
      const endDate = new Date(2025, 0, 31);
      
      act(() => {
        result.current.setDateFilter('custom');
        result.current.setCustomStartDate(startDate);
        result.current.setCustomEndDate(endDate);
      });

      const params = result.current.getNavigationParams();

      expect(params.dateFilter).toBe('custom');
      expect(params.selectedMonth).toBeUndefined();
      expect(params.customStartDate).toEqual(startDate);
      expect(params.customEndDate).toEqual(endDate);
    });
  });

});
