import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useTransactionMutations } from '@/hooks/transactions/useTransactionMutations';
import { supabase } from '@/integrations/supabase/client';
import { TransactionInput } from '@/types';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
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
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return QueryClientProvider({ client: queryClient, children });
  };

  describe('handleAddTransaction', () => {
    it('should successfully add a transaction', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const transactionData: TransactionInput = {
        description: 'Test Transaction',
        amount: 10000,
        date: new Date('2025-01-01'),
        type: 'expense',
        category_id: 'cat-123',
        account_id: 'acc-123',
        status: 'completed',
      };

      await result.current.handleAddTransaction(transactionData);

      expect(mockInvoke).toHaveBeenCalledWith('atomic-transaction', {
        body: {
          transaction: {
            description: 'Test Transaction',
            amount: 10000,
            date: '2025-01-01',
            type: 'expense',
            category_id: 'cat-123',
            account_id: 'acc-123',
            status: 'completed',
            invoice_month: null,
            invoice_month_overridden: false,
          },
        },
      });
    });

    it('should handle credit limit exceeded error', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Credit limit exceeded. Available: 50000 | Limit: 100000 | Used: 50000 | Requested: 60000',
        },
      });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const transactionData: TransactionInput = {
        description: 'Test Transaction',
        amount: 60000,
        date: new Date('2025-01-01'),
        type: 'expense',
        category_id: 'cat-123',
        account_id: 'credit-acc-123',
        status: 'completed',
      };

      await result.current.handleAddTransaction(transactionData);

      // Should not throw, should handle gracefully with toast
      expect(mockInvoke).toHaveBeenCalled();
    });

    it('should include invoice month for credit card transactions', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      const transactionData: TransactionInput = {
        description: 'Credit Card Purchase',
        amount: 10000,
        date: new Date('2025-01-01'),
        type: 'expense',
        category_id: 'cat-123',
        account_id: 'credit-acc-123',
        status: 'completed',
        invoiceMonth: '2025-02',
      };

      await result.current.handleAddTransaction(transactionData);

      expect(mockInvoke).toHaveBeenCalledWith('atomic-transaction', {
        body: expect.objectContaining({
          transaction: expect.objectContaining({
            invoice_month: '2025-02',
            invoice_month_overridden: true,
          }),
        }),
      });
    });
  });

  describe('handleEditTransaction', () => {
    it('should successfully edit a transaction', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await result.current.handleEditTransaction(
        {
          id: 'tx-123',
          description: 'Updated Description',
          amount: 15000,
        },
        'current'
      );

      expect(mockInvoke).toHaveBeenCalledWith('atomic-edit-transaction', {
        body: {
          transaction_id: 'tx-123',
          updates: {
            description: 'Updated Description',
            amount: 15000,
          },
          scope: 'current',
        },
      });
    });

    it('should handle date conversion for edit', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await result.current.handleEditTransaction(
        {
          id: 'tx-123',
          date: new Date('2025-02-15'),
        },
        'current'
      );

      expect(mockInvoke).toHaveBeenCalledWith('atomic-edit-transaction', {
        body: expect.objectContaining({
          updates: expect.objectContaining({
            date: '2025-02-15',
          }),
        }),
      });
    });

    it('should support different edit scopes', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await result.current.handleEditTransaction(
        {
          id: 'tx-123',
          amount: 20000,
        },
        'all'
      );

      expect(mockInvoke).toHaveBeenCalledWith('atomic-edit-transaction', {
        body: expect.objectContaining({
          scope: 'all',
        }),
      });
    });
  });

  describe('handleDeleteTransaction', () => {
    it('should successfully delete a transaction', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { success: true, deleted: 1 },
        error: null,
      });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await result.current.handleDeleteTransaction('tx-123', 'current');

      expect(mockInvoke).toHaveBeenCalledWith('atomic-delete-transaction', {
        body: {
          transaction_id: 'tx-123',
          scope: 'current',
        },
      });
    });

    it('should handle deletion of multiple transactions', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { success: true, deleted: 5 },
        error: null,
      });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await result.current.handleDeleteTransaction('tx-123', 'all');

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('atomic-delete-transaction', {
          body: expect.objectContaining({
            scope: 'all',
          }),
        });
      });
    });

    it('should handle transaction not found error', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { success: false, error: 'Transaction not found' },
        error: null,
      });

      const { result } = renderHook(() => useTransactionMutations(), { wrapper });

      await expect(
        result.current.handleDeleteTransaction('invalid-tx', 'current')
      ).rejects.toThrow();
    });
  });
});
