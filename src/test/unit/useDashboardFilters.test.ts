import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { startOfMonth, endOfMonth, format } from 'date-fns';

describe('useDashboardFilters', () => {
  beforeEach(() => {
    localStorage.clear();
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

  describe('getDateRange', () => {
    it('should return correct range for current_month', () => {
      const { result } = renderHook(() => useDashboardFilters());
      
      const now = new Date();
      const expectedFrom = format(startOfMonth(now), 'yyyy-MM-dd');
      const expectedTo = format(endOfMonth(now), 'yyyy-MM-dd');

      const range = result.current.getDateRange();

      expect(range.dateFrom).toBe(expectedFrom);
      expect(range.dateTo).toBe(expectedTo);
    });

    it('should return correct range for month_picker', () => {
      const { result } = renderHook(() => useDashboardFilters());
      const selectedDate = new Date(2025, 0, 15); // Jan 15, 2025

      act(() => {
        result.current.setDateFilter('month_picker');
        result.current.setSelectedMonth(selectedDate);
      });

      const range = result.current.getDateRange();
      
      // Should be full month of Jan 2025
      expect(range.dateFrom).toBe('2025-01-01');
      expect(range.dateTo).toBe('2025-01-31');
    });

    it('should return correct range for custom dates', () => {
      const { result } = renderHook(() => useDashboardFilters());
      const startDate = new Date(2025, 0, 10);
      const endDate = new Date(2025, 0, 20);

      act(() => {
        result.current.setDateFilter('custom');
        result.current.setCustomStartDate(startDate);
        result.current.setCustomEndDate(endDate);
      });

      const range = result.current.getDateRange();

      expect(range.dateFrom).toBe('2025-01-10');
      expect(range.dateTo).toBe('2025-01-20');
    });

    it('should return undefined range for all', () => {
      const { result } = renderHook(() => useDashboardFilters());

      act(() => {
        result.current.setDateFilter('all');
      });

      const range = result.current.getDateRange();

      expect(range.dateFrom).toBeUndefined();
      expect(range.dateTo).toBeUndefined();
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
      // Check if month changed correctly (handling year wrap)
      const expectedMonth = new Date(initialMonth);
      expectedMonth.setMonth(expectedMonth.getMonth() - 1);
      
      expect(newMonth.getMonth()).toBe(expectedMonth.getMonth());
      expect(newMonth.getFullYear()).toBe(expectedMonth.getFullYear());
    });

    it('should navigate to next month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      const initialMonth = result.current.selectedMonth;
      
      act(() => {
        result.current.goToNextMonth();
      });

      const newMonth = result.current.selectedMonth;
      const expectedMonth = new Date(initialMonth);
      expectedMonth.setMonth(expectedMonth.getMonth() + 1);

      expect(newMonth.getMonth()).toBe(expectedMonth.getMonth());
      expect(newMonth.getFullYear()).toBe(expectedMonth.getFullYear());
    });
  });

  describe('Navigation parameters', () => {
    it('should return correct params for current_month', () => {
      const { result } = renderHook(() => useDashboardFilters());

      // Ensure state is clean
      act(() => {
        result.current.setDateFilter('current_month');
      });

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
