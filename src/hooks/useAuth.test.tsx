import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import * as Sentry from '@sentry/react';
import { ReactNode } from 'react';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock Sentry
vi.mock('@/sentry/react', () => ({
  captureException: vi.fn(),
}));

// Mock tab sync
vi.mock('@/lib/tabSync', () => ({
  getTabSynchronizer: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
    broadcast: vi.fn(),
  })),
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock setSentryUser
vi.mock('@/lib/sentry', () => ({
  setSentryUser: vi.fn(),
}));

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: { full_name: 'Test User' },
    aud: 'authenticated',
    created_at: '2025-01-01T00:00:00Z',
  };

  const mockProfile = {
    id: 'profile-123',
    user_id: 'user-123',
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: null,
    whatsapp: null,
    is_active: true,
    role: 'user' as const,
    trial_expires_at: null,
    subscription_expires_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const mockSession = {
    user: mockUser,
    session: { access_token: 'token-123' },
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe('Initial State', () => {
    it('should have loading state true initially', () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
    });

    it('should throw error when used outside AuthProvider', () => {
      const { result } = renderHook(() => useAuth());
      
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('useAuth must be used within an AuthProvider');
    });
  });

  describe('Session Management', () => {
    it('should load session on mount', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: mockProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.session).toBeDefined();
      });
    });

    it('should handle session fetch error gracefully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: new Error('Network error'),
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('Sign In', () => {
    it('should sign in user successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: mockUser, session: mockSession as any },
        error: null,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signInResult: any;
      await act(async () => {
        signInResult = await result.current.signIn('test@example.com', 'password123');
      });

      expect(signInResult.error).toBeNull();
    });

    it('should handle sign in error', async () => {
      const mockError = new Error('Invalid credentials');

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: mockError,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signInResult: any;
      await act(async () => {
        signInResult = await result.current.signIn('test@example.com', 'wrongpassword');
      });

      expect(signInResult.error).toBeDefined();
    });

    it('should handle network error in sign in', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const networkError = new Error('Network timeout');
      vi.mocked(supabase.auth.signInWithPassword).mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signInResult: any;
      await act(async () => {
        signInResult = await result.current.signIn('test@example.com', 'password123');
      });

      expect(signInResult.error).toBeDefined();
    });
  });

  describe('Sign Up', () => {
    it('should sign up user successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: { user: mockUser, session: mockSession as any },
        error: null,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signUpResult: any;
      await act(async () => {
        signUpResult = await result.current.signUp(
          'newuser@example.com',
          'password123',
          'New User',
          '11999999999'
        );
      });

      expect(signUpResult.error).toBeNull();
    });

    it('should handle sign up error (duplicate email)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const duplicateError = new Error('User already exists');

      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: duplicateError,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signUpResult: any;
      await act(async () => {
        signUpResult = await result.current.signUp(
          'existing@example.com',
          'password123',
          'Existing User'
        );
      });

      expect(signUpResult.error).toBeDefined();
    });
  });

  describe('Sign Out', () => {
    it('should sign out user successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
        error: null,
      } as any);

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signOutResult: any;
      await act(async () => {
        signOutResult = await result.current.signOut();
      });

      expect(signOutResult.error).toBeNull();
    });

    it('should handle sign out error', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const signOutError = new Error('Sign out failed');

      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
        error: signOutError,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let signOutResult: any;
      await act(async () => {
        signOutResult = await result.current.signOut();
      });

      expect(signOutResult.error).toBeDefined();
    });
  });

  describe('Reset Password', () => {
    it('should reset password successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: {},
        error: null,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let resetResult: any;
      await act(async () => {
        resetResult = await result.current.resetPassword('test@example.com');
      });

      expect(resetResult.error).toBeNull();
    });

    it('should handle reset password error (user not found)', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      const notFoundError = new Error('User not found');

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: null,
        error: notFoundError,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let resetResult: any;
      await act(async () => {
        resetResult = await result.current.resetPassword('nonexistent@example.com');
      });

      expect(resetResult.error).toBeDefined();
    });
  });

  describe('Role & Permission Checks', () => {
    it('should correctly identify admin user', async () => {
      const adminProfile = { ...mockProfile, role: 'admin' as const };

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: adminProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.isAdmin()).toBe(true);
    });

    it('should return false for non-admin user', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: mockProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.isAdmin()).toBe(false);
    });

    it('should check role correctly with hasRole', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: mockProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.hasRole('user')).toBe(true);
      expect(result.current.hasRole('admin')).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('should correctly check if subscription is active', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const activeSubscriberProfile = {
        ...mockProfile,
        role: 'subscriber' as const,
        subscription_expires_at: futureDate,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: activeSubscriberProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.isSubscriptionActive()).toBe(true);
    });

    it('should return false for expired subscription', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const expiredProfile = {
        ...mockProfile,
        role: 'subscriber' as const,
        subscription_expires_at: pastDate,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: expiredProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.isSubscriptionActive()).toBe(false);
    });

    it('should calculate subscription time remaining correctly', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days
      const activeProfile = {
        ...mockProfile,
        role: 'trial' as const,
        trial_expires_at: futureDate,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: activeProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      const timeRemaining = result.current.getSubscriptionTimeRemaining();
      expect(timeRemaining).toContain('dias');
    });

    it('should return expired message for expired subscription', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const expiredProfile = {
        ...mockProfile,
        role: 'trial' as const,
        trial_expires_at: pastDate,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: expiredProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeDefined();
      });

      expect(result.current.getSubscriptionTimeRemaining()).toBe('Expirado');
    });
  });

  describe('User Data Initialization', () => {
    it('should initialize user data successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValueOnce({
              data: [{ id: 'category-1' }],
              error: null,
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      } as any);

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.initializeUserData();
      });

      expect(supabase.from).toHaveBeenCalled();
    });
  });

  describe('Profile Fetch', () => {
    it('should handle profile fetch error gracefully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as any },
        error: null,
      } as any);

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: null,
              error: new Error('Database error'),
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.profile).toBeNull();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should not update state after unmount', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      } as any);

      const unsubscribeMock = vi.fn();
      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValueOnce({
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any);

      const { unmount } = renderHook(() => useAuth(), { wrapper });

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
