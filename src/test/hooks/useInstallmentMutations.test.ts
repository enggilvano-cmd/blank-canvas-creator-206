import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useInstallmentMutations } from '@/hooks/transactions/useInstallmentMutations';
import { supabase } from '@/integrations/supabase/client';
import { InstallmentTransactionInput } from '@/types';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          error: null,
        })),
      })),
    })),
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

describe('useInstallmentMutations', () => {
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

  describe('handleAddInstallmentTransactions', () => {
    it('should successfully create installment transactions', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      
      // Mock successful creation of 3 installments
      mockInvoke
        .mockResolvedValueOnce({ 
          data: { transaction: { id: 'tx-1' } }, 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: { transaction: { id: 'tx-2' } }, 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: { transaction: { id: 'tx-3' } }, 
          error: null 
        });

      const { result } = renderHook(() => useInstallmentMutations(), { wrapper });

      const installments: InstallmentTransactionInput[] = [
        {
          description: 'Purchase 1/3',
          amount: 10000,
          date: new Date('2025-01-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'acc-123',
          status: 'completed',
          currentInstallment: 1,
        },
        {
          description: 'Purchase 2/3',
          amount: 10000,
          date: new Date('2025-02-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'acc-123',
          status: 'pending',
          currentInstallment: 2,
        },
        {
          description: 'Purchase 3/3',
          amount: 10000,
          date: new Date('2025-03-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'acc-123',
          status: 'pending',
          currentInstallment: 3,
        },
      ];

      await result.current.handleAddInstallmentTransactions(installments);

      expect(mockInvoke).toHaveBeenCalledTimes(3);
      expect(mockInvoke).toHaveBeenCalledWith('atomic-transaction', {
        body: expect.objectContaining({
          transaction: expect.objectContaining({
            description: 'Purchase 1/3',
            amount: 10000,
            date: '2025-01-01',
          }),
        }),
      });
    });

    it('should link installments with parent_transaction_id', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      const mockFrom = vi.mocked(supabase.from);
      
      mockInvoke
        .mockResolvedValueOnce({ data: { transaction: { id: 'parent-tx' } }, error: null })
        .mockResolvedValueOnce({ data: { transaction: { id: 'child-tx-1' } }, error: null });

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));
      mockFrom.mockReturnValue({
        update: mockUpdate,
      } as never);

      const { result } = renderHook(() => useInstallmentMutations(), { wrapper });

      const installments: InstallmentTransactionInput[] = [
        {
          description: 'Purchase 1/2',
          amount: 5000,
          date: new Date('2025-01-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'acc-123',
          status: 'completed',
          currentInstallment: 1,
        },
        {
          description: 'Purchase 2/2',
          amount: 5000,
          date: new Date('2025-02-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'acc-123',
          status: 'pending',
          currentInstallment: 2,
        },
      ];

      await result.current.handleAddInstallmentTransactions(installments);

      expect(mockUpdate).toHaveBeenCalledWith({
        installments: 2,
        current_installment: 1,
        parent_transaction_id: 'parent-tx',
      });
    });

    it('should handle credit limit error in installments', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Credit limit exceeded. Available: 10000 | Limit: 50000 | Used: 40000 | Requested: 15000',
        },
      });

      const { result } = renderHook(() => useInstallmentMutations(), { wrapper });

      const installments: InstallmentTransactionInput[] = [
        {
          description: 'Purchase 1/1',
          amount: 15000,
          date: new Date('2025-01-01'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'credit-acc',
          status: 'completed',
          currentInstallment: 1,
        },
      ];

      await result.current.handleAddInstallmentTransactions(installments);

      // Should handle gracefully without throwing
      expect(mockInvoke).toHaveBeenCalled();
    });

    it('should handle invoice month for credit card installments', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValue({ 
        data: { transaction: { id: 'tx-1' } }, 
        error: null 
      });

      const { result } = renderHook(() => useInstallmentMutations(), { wrapper });

      const installments: InstallmentTransactionInput[] = [
        {
          description: 'Purchase 1/2',
          amount: 5000,
          date: new Date('2025-01-15'),
          type: 'expense',
          category_id: 'cat-123',
          account_id: 'credit-acc',
          status: 'completed',
          currentInstallment: 1,
          invoiceMonth: '2025-02',
        },
      ];

      await result.current.handleAddInstallmentTransactions(installments);

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
});
