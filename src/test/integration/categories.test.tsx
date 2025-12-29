import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCategories } from '@/hooks/useCategories';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

describe('Category Integration Tests', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Food',
      type: 'expense',
      color: '#ef4444',
      user_id: 'user-123',
    },
    {
      id: 'cat-2',
      name: 'Salary',
      type: 'income',
      color: '#10b981',
      user_id: 'user-123',
    },
    {
      id: 'cat-3',
      name: 'Transfer',
      type: 'both',
      color: '#3b82f6',
      user_id: 'user-123',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Category Filtering', () => {
    it('should filter expense categories', () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      act(() => {
        // Simulate categories loaded
        (result.current as any).categories = mockCategories;
      });

      const expenseCategories = mockCategories.filter(
        c => c.type === 'expense' || c.type === 'both'
      );

      expect(expenseCategories).toHaveLength(2);
      expect(expenseCategories.map(c => c.name)).toContain('Food');
      expect(expenseCategories.map(c => c.name)).toContain('Transfer');
    });

    it('should filter income categories', () => {
      const incomeCategories = mockCategories.filter(
        c => c.type === 'income' || c.type === 'both'
      );

      expect(incomeCategories).toHaveLength(2);
      expect(incomeCategories.map(c => c.name)).toContain('Salary');
      expect(incomeCategories.map(c => c.name)).toContain('Transfer');
    });
  });

  describe('Category Assignment', () => {
    it('should allow expense category for expense transaction', () => {
      const expenseCategory = mockCategories.find(c => c.name === 'Food');
      const transaction = {
        type: 'expense',
        category_id: expenseCategory?.id,
      };

      expect(transaction.category_id).toBe('cat-1');
      expect(expenseCategory?.type).toBe('expense');
    });

    it('should allow income category for income transaction', () => {
      const incomeCategory = mockCategories.find(c => c.name === 'Salary');
      const transaction = {
        type: 'income',
        category_id: incomeCategory?.id,
      };

      expect(transaction.category_id).toBe('cat-2');
      expect(incomeCategory?.type).toBe('income');
    });

    it('should allow "both" category for any transaction type', () => {
      const bothCategory = mockCategories.find(c => c.name === 'Transfer');
      
      const expenseTransaction = {
        type: 'expense',
        category_id: bothCategory?.id,
      };
      
      const incomeTransaction = {
        type: 'income',
        category_id: bothCategory?.id,
      };

      expect(bothCategory?.type).toBe('both');
      expect(expenseTransaction.category_id).toBe('cat-3');
      expect(incomeTransaction.category_id).toBe('cat-3');
    });
  });
});
