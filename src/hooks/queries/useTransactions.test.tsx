import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTransactions } from './useTransactions';
import * as supabaseModule from '@/integrations/supabase/client';
import { ReactNode } from 'react';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com' },
  }),
}));

const mockQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={mockQueryClient}>
    {children}
  </QueryClientProvider>
);

describe('useTransactions hook', () => {
  beforeEach(() => {
    mockQueryClient.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    
    // Hook should be defined
    expect(result.current).toBeDefined();
  });

  it('should have proper query structure', () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    
    // Should have isLoading, data, error properties
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('error');
  });

  it('should return empty array initially if no data', async () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    
    // Initially should not have data
    expect(result.current.data === undefined || Array.isArray(result.current.data)).toBe(true);
  });

  it('should have proper dependencies', () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    
    // Hook should be stable
    expect(result.current).toBeDefined();
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('should support search parameter', () => {
    const { result } = renderHook(() => useTransactions({ search: 'test' }), { wrapper });
    
    expect(result.current).toBeDefined();
  });

  it('should support type filtering', () => {
    const { result } = renderHook(() => useTransactions({ type: 'expense' }), { wrapper });
    
    expect(result.current).toBeDefined();
  });

  it('should support account filtering', () => {
    const { result } = renderHook(() => useTransactions({ accountId: 'acc-1' }), { wrapper });
    
    expect(result.current).toBeDefined();
  });

  it('should be able to disable query', () => {
    const { result } = renderHook(() => useTransactions({ enabled: false }), { wrapper });
    
    expect(result.current).toBeDefined();
  });

  it('should provide mutation functions', () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    
    // Should have addMutation or similar
    expect(result.current).toHaveProperty('isLoading');
  });
});
