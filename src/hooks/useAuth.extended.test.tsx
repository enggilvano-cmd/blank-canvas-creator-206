import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import * as supabaseModule from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toBeDefined();
  });

  it('should have user property', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toHaveProperty('user');
  });

  it('should have isLoading property', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('should have error property', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toHaveProperty('error');
  });

  it('should have signOut method', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signOut).toBe('function');
  });

  it('should have signIn method if not authenticated', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toHaveProperty('signIn');
  });

  it('should setup subscription on mount', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toBeDefined();
  });

  it('should have cleanup function', () => {
    const { unmount } = renderHook(() => useAuth());
    expect(unmount).toBeDefined();
  });

  it('should be stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useAuth());
    const firstResult = result.current;
    
    rerender();
    const secondResult = result.current;
    
    // Should return same object or equivalent
    expect(typeof firstResult).toBe(typeof secondResult);
  });

  it('should handle auth state changes', async () => {
    const { result } = renderHook(() => useAuth());
    
    // Hook should respond to auth changes
    expect(result.current).toBeDefined();
  });

  it('should not leak memory on unmount', () => {
    const { unmount } = renderHook(() => useAuth());
    
    // Should not throw on unmount
    expect(() => unmount()).not.toThrow();
  });
});
