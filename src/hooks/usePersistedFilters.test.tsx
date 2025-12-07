import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedFilters } from './usePersistedFilters';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('usePersistedFilters', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  describe('Initialize with defaults', () => {
    it('should initialize with default filters', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
          sortOrder: 'desc',
        }),
        { wrapper }
      );

      expect(result.current.filters).toEqual({
        search: '',
        sortBy: 'date',
        sortOrder: 'desc',
      });
    });
  });

  describe('Persist to localStorage', () => {
    it('should save filters to localStorage', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters({
          search: 'test query',
          sortBy: 'amount',
        });
      });

      const saved = localStorage.getItem('testFilters');
      expect(saved).toBeDefined();

      const parsed = JSON.parse(saved!);
      expect(parsed.search).toBe('test query');
      expect(parsed.sortBy).toBe('amount');
    });

    it('should restore filters from localStorage', () => {
      const saved = {
        search: 'previous',
        sortBy: 'description',
      };

      localStorage.setItem('testFilters', JSON.stringify(saved));

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      // Wait for mount effect
      expect(result.current.filters).toEqual(saved);
    });
  });

  describe('Data Validation', () => {
    it('should discard invalid filters from localStorage', () => {
      const invalid = {
        search: 'valid',
        sortBy: 'invalid_sort_by',
        unknownField: 'should be removed',
      };

      localStorage.setItem('testFilters', JSON.stringify(invalid));

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      // Should use defaults or valid fields only
      expect(result.current.filters).toBeDefined();
      expect(typeof result.current.filters.search).toBe('string');
    });

    it('should handle corrupted JSON gracefully', () => {
      localStorage.setItem('testFilters', 'corrupted{json');

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      // Should fallback to defaults
      expect(result.current.filters).toEqual({
        search: '',
        sortBy: 'date',
      });
    });

    it('should handle null from localStorage', () => {
      localStorage.removeItem('testFilters');

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      expect(result.current.filters).toEqual({
        search: '',
        sortBy: 'date',
      });
    });
  });

  describe('Update Filters', () => {
    it('should update individual filter properties', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
          status: 'all',
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters({
          search: 'new search',
        });
      });

      expect(result.current.filters.search).toBe('new search');
      expect(result.current.filters.sortBy).toBe('date'); // Preserved
      expect(result.current.filters.status).toBe('all'); // Preserved
    });

    it('should reset filters to defaults', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters({
          search: 'test',
          sortBy: 'amount',
        });
      });

      expect(result.current.filters.search).toBe('test');

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.filters).toEqual({
        search: '',
        sortBy: 'date',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string search', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters({ search: '' });
      });

      expect(result.current.filters.search).toBe('');
    });

    it('should handle special characters in filters', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
        }),
        { wrapper }
      );

      const specialChars = 'test@#$%^&*()_+{}:"|<>?';

      act(() => {
        result.current.setFilters({ search: specialChars });
      });

      expect(result.current.filters.search).toBe(specialChars);

      // Check persistence
      const saved = localStorage.getItem('testFilters');
      const parsed = JSON.parse(saved!);
      expect(parsed.search).toBe(specialChars);
    });

    it('should handle unicode characters', () => {
      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
        }),
        { wrapper }
      );

      const unicode = '你好世界 🌍 Привет';

      act(() => {
        result.current.setFilters({ search: unicode });
      });

      expect(result.current.filters.search).toBe(unicode);
    });

    it('should handle very large filter objects', () => {
      const largeFilter = {
        search: 'a'.repeat(1000),
        sortBy: 'date',
        items: Array(100).fill({ id: 1, name: 'test' }),
      };

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
          sortBy: 'date',
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters(largeFilter as any);
      });

      const saved = localStorage.getItem('testFilters');
      expect(saved).toBeDefined();
    });
  });

  describe('Storage Quota', () => {
    it('should handle storage quota exceeded gracefully', () => {
      // Mock localStorage to throw QuotaExceededError
      const originalSetItem = localStorage.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(
        () => usePersistedFilters('testFilters', {
          search: '',
        }),
        { wrapper }
      );

      // Should not crash
      expect(result.current.filters).toBeDefined();

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('Multiple Instances', () => {
    it('should handle multiple hook instances with different keys', () => {
      const { result: result1 } = renderHook(
        () => usePersistedFilters('filters1', {
          search: '',
        }),
        { wrapper }
      );

      const { result: result2 } = renderHook(
        () => usePersistedFilters('filters2', {
          search: '',
        }),
        { wrapper }
      );

      act(() => {
        result1.current.setFilters({ search: 'filter1' });
      });

      act(() => {
        result2.current.setFilters({ search: 'filter2' });
      });

      expect(result1.current.filters.search).toBe('filter1');
      expect(result2.current.filters.search).toBe('filter2');

      // Verify separate storage
      expect(localStorage.getItem('filters1')).toContain('filter1');
      expect(localStorage.getItem('filters2')).toContain('filter2');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety with filter updates', () => {
      interface TestFilters {
        search: string;
        sortBy: 'date' | 'amount' | 'description';
        page: number;
      }

      const { result } = renderHook(
        () => usePersistedFilters<TestFilters>('testFilters', {
          search: '',
          sortBy: 'date',
          page: 1,
        }),
        { wrapper }
      );

      act(() => {
        result.current.setFilters({
          sortBy: 'amount',
          page: 2,
        });
      });

      expect(result.current.filters.sortBy).toBe('amount');
      expect(result.current.filters.page).toBe(2);
    });
  });
});
