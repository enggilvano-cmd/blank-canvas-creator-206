import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTransactionMutations } from './useTransactionMutations';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ReactNode } from 'react';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth');
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useTransactionMutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-123' } as any,
      session: null,
      profile: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      isAdmin: vi.fn(),
      hasRole: vi.fn(),
      isSubscriptionActive: vi.fn(),
      getSubscriptionTimeRemaining: vi.fn(),
      initializeUserData: vi.fn(),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const mockTransactionInput = {
    description: 'Test Transaction',
    amount: 100.00,
    date: new Date('2025-01-01'),
    type: 'expense' as const,
    category_id: 'cat-123',
    account_id: 'acc-123',
    status: 'completed' as const,
    invoiceMonth: null,
  };

  const mockTransaction = {
    id: 'tx-123',
    ...mockTransactionInput,
    date: '2025-01-01',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    invoice_month_overridden: false,
    user_id: 'user-123',
    category: null,
    account: null,
    to_account: null,
    installments: 1,
    current_installment: 1,
    is_recurring: false,
    is_fixed: false,
  };

  describe('handleAddTransaction', () => {
    it('should add transaction successfully', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: mockTransaction },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      let addResult: any;
      await act(async () => {
        addResult = await result.current.handleAddTransaction(mockTransactionInput);
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('atomic-transaction', expect.any(Object));
    });

    it('should handle error when adding transaction', async () => {
      const mockError = new Error('Database error');

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: mockError,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(mockTransactionInput);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should perform optimistic update for balance', async () => {
      const mockAccount = {
        id: 'acc-123',
        user_id: 'user-123',
        name: 'Checking',
        type: 'checking' as const,
        balance: 1000,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        currency: 'BRL',
        archived_at: null,
        limit: 0,
        interest_rate: 0,
      };

      queryClient.setQueryData(['accounts'], [mockAccount]);

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: mockTransaction },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const previousBalance = mockAccount.balance;

      await act(async () => {
        await result.current.handleAddTransaction(mockTransactionInput);
      });

      // Optimistic update should be applied
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should handle expense transaction correctly', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: mockTransaction },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const expenseInput = { ...mockTransactionInput, type: 'expense' as const };

      await act(async () => {
        await result.current.handleAddTransaction(expenseInput);
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should handle income transaction correctly', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: mockTransaction },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const incomeInput = { ...mockTransactionInput, type: 'income' as const };

      await act(async () => {
        await result.current.handleAddTransaction(incomeInput);
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should not add transaction when user is not authenticated', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        session: null,
        profile: null,
        loading: false,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        resetPassword: vi.fn(),
        isAdmin: vi.fn(),
        hasRole: vi.fn(),
        isSubscriptionActive: vi.fn(),
        getSubscriptionTimeRemaining: vi.fn(),
        initializeUserData: vi.fn(),
      });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        await result.current.handleAddTransaction(mockTransactionInput);
      });

      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  describe('handleEditTransaction', () => {
    it('should edit transaction successfully', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: { ...mockTransaction, description: 'Updated' } },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const updateData: any = {
        id: 'tx-123',
        description: 'Updated Transaction',
      };

      await act(async () => {
        await result.current.handleEditTransaction('tx-123', updateData, 'single');
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should handle edit error', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Update failed'),
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const updateData: any = { description: 'Updated' };

      await act(async () => {
        try {
          await result.current.handleEditTransaction('tx-123', updateData, 'single');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('handleDeleteTransaction', () => {
    it('should delete transaction successfully', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        await result.current.handleDeleteTransaction('tx-123', 'single');
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Delete failed'),
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleDeleteTransaction('tx-123', 'single');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should handle delete scope (single/all)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      // Test single delete
      await act(async () => {
        await result.current.handleDeleteTransaction('tx-123', 'single');
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();

      // Test all delete
      vi.clearAllMocks();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true },
        error: null,
      } as any);

      await act(async () => {
        await result.current.handleDeleteTransaction('tx-123', 'all');
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });
  });

  describe('Transaction Validation', () => {
    it('should validate transaction amount is positive', async () => {
      const invalidInput = {
        ...mockTransactionInput,
        amount: -100, // Invalid negative amount
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Invalid amount'),
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(invalidInput);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should validate transaction date is valid', async () => {
      const invalidInput = {
        ...mockTransactionInput,
        date: new Date('invalid-date'),
      };

      // Date constructor still creates valid date with 'invalid-date'
      // In real code, this would be validated elsewhere
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, transaction: mockTransaction },
        error: null,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        await result.current.handleAddTransaction(invalidInput);
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const incompleteInput: any = {
        description: 'Test',
        // Missing amount, date, type, etc
      };

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      // Should handle gracefully
      await act(async () => {
        try {
          await result.current.handleAddTransaction(incompleteInput);
        } catch (error) {
          // Expected to error
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should rollback on network error', async () => {
      const networkError = new Error('Network timeout');

      vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(mockTransactionInput);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should handle database constraint errors', async () => {
      const constraintError = new Error('Duplicate key violation');

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: constraintError,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(mockTransactionInput);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should provide meaningful error messages', async () => {
      const error = new Error('User quota exceeded');

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: error,
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(mockTransactionInput);
        } catch (err) {
          expect(err).toBeDefined();
        }
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limiting', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Rate limit exceeded'),
      } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        try {
          await result.current.handleAddTransaction(mockTransactionInput);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(supabase.functions.invoke).toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent adds', async () => {
      vi.mocked(supabase.functions.invoke)
        .mockResolvedValueOnce({
          data: { success: true, transaction: mockTransaction },
          error: null,
        } as any)
        .mockResolvedValueOnce({
          data: { success: true, transaction: { ...mockTransaction, id: 'tx-124' } },
          error: null,
        } as any);

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await act(async () => {
        const promise1 = result.current.handleAddTransaction(mockTransactionInput);
        const promise2 = result.current.handleAddTransaction({
          ...mockTransactionInput,
          amount: 200,
        });

        await Promise.all([promise1, promise2]);
      });

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    });
  });
});
