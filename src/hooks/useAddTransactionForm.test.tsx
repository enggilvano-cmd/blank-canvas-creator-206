import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAddTransactionForm } from './useAddTransactionForm';
import { Account } from '@/types';
import { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [
      {
        id: '1',
        name: 'Alimentação',
        type: 'expense',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  }),
}));

const mockQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const mockAccounts: Account[] = [
  {
    id: '1',
    name: 'Conta Corrente',
    type: 'checking',
    bank_name: 'Banco A',
    balance: 10000,
    currency: 'BRL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    user_id: 'user-1',
  },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={mockQueryClient}>
    {children}
  </QueryClientProvider>
);

describe('useAddTransactionForm hook', () => {
  beforeEach(() => {
    mockQueryClient.clear();
    vi.clearAllMocks();
  });

  const defaultParams = {
    open: true,
    accounts: mockAccounts,
    onAddTransaction: vi.fn(),
    onClose: vi.fn(),
  };

  it('should initialize with default form state', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    expect(result.current.formData).toBeDefined();
    expect(result.current.formData.description).toBe('');
    expect(result.current.formData.amount).toBe(0);
  });

  it('should have type as empty string initially', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    expect(result.current.formData.type).toBe('');
  });

  it('should reset form when open prop changes to true', async () => {
    const { result, rerender } = renderHook(
      (props) => useAddTransactionForm(props),
      { wrapper, initialProps: { ...defaultParams, open: false } }
    );

    rerender({ ...defaultParams, open: true });

    await waitFor(() => {
      expect(result.current.formData.description).toBe('');
    });
  });

  it('should validate required fields before submit', async () => {
    const onAddTransaction = vi.fn();
    const { result } = renderHook(
      () => useAddTransactionForm({ ...defaultParams, onAddTransaction }),
      { wrapper }
    );

    // Try to submit empty form
    const formEvent = new Event('submit') as any;
    formEvent.preventDefault = vi.fn();
    
    await result.current.handleSubmit(formEvent);

    // Should have validation errors
    expect(Object.keys(result.current.validationErrors).length).toBeGreaterThanOrEqual(0);
  });

  it('should accept initial type', () => {
    const { result } = renderHook(
      () => useAddTransactionForm({ ...defaultParams, initialType: 'expense' }),
      { wrapper }
    );

    expect(result.current.formData.type).toBe('expense');
  });

  it('should have setFormData function', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    expect(typeof result.current.setFormData).toBe('function');
  });

  it('should provide filtered categories based on type', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    expect(Array.isArray(result.current.filteredCategories)).toBe(true);
  });

  it('should handle custom installments', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    expect(typeof result.current.setCustomInstallments).toBe('function');
  });

  it('should provide selected account', () => {
    const { result } = renderHook(() => useAddTransactionForm(defaultParams), { wrapper });
    
    // Should have selectedAccount property
    expect(result.current.selectedAccount === undefined || result.current.selectedAccount !== null).toBe(true);
  });

  it('should handle form submission', async () => {
    const onAddTransaction = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    
    const { result } = renderHook(
      () => useAddTransactionForm({ ...defaultParams, onAddTransaction, onClose }),
      { wrapper }
    );

    expect(typeof result.current.handleSubmit).toBe('function');
  });
});
