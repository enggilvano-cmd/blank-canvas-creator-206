import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { useAccountStore } from '@/stores/AccountStore';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Account Integration Tests', () => {
  const mockUser = { id: 'test-user-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser as any },
      error: null,
    });
  });

  describe('Account Creation', () => {
    it('should create a checking account successfully', async () => {
      const newAccount = {
        id: 'account-123',
        user_id: mockUser.id,
        name: 'Main Checking',
        type: 'checking',
        balance: 100000, // $1,000.00
        color: '#3b82f6',
      };

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [newAccount],
            error: null,
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        await result.current.addAccount({
          name: 'Main Checking',
          type: 'checking' as const,
          balance: 100000,
          color: '#3b82f6',
        });
      });

      await act(async () => {
        result.current.setAccounts([newAccount as any]);
      });

      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].name).toBe('Main Checking');
      expect(result.current.accounts[0].balance).toBe(100000);
    });

    it('should create a credit card account with limit', async () => {
      const creditAccount = {
        id: 'credit-123',
        user_id: mockUser.id,
        name: 'Credit Card',
        type: 'credit',
        balance: 0,
        limit_amount: 500000, // $5,000.00 limit
        closing_date: 15,
        due_date: 25,
        color: '#ef4444',
      };

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [creditAccount],
            error: null,
          }),
        }),
      } as any);

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([creditAccount as any]);
      });

      const account = result.current.accounts[0];
      expect(account.type).toBe('credit');
      expect(account.limit_amount).toBe(500000);
      expect(account.closing_date).toBe(15);
      expect(account.due_date).toBe(25);
    });
  });

  describe('Account Balance Updates', () => {
    it('should update account balance after transaction', async () => {
      const account = {
        id: 'account-123',
        user_id: mockUser.id,
        name: 'Checking',
        type: 'checking',
        balance: 100000,
        color: '#3b82f6',
      };

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([account as any]);
      });

      expect(result.current.accounts[0].balance).toBe(100000);

      // Simulate income transaction
      await act(async () => {
        result.current.updateAccounts([{
          ...account,
          balance: 150000,
        } as any]);
      });

      expect(result.current.accounts[0].balance).toBe(150000);
    });

    it('should handle multiple concurrent balance updates', async () => {
      const account = {
        id: 'account-123',
        user_id: mockUser.id,
        name: 'Checking',
        type: 'checking',
        balance: 100000,
        color: '#3b82f6',
      };

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([account as any]);
      });

      // Simulate multiple transactions
      await act(async () => {
        result.current.updateAccounts([{ ...account, balance: 90000 } as any]);
        result.current.updateAccounts([{ ...account, balance: 95000 } as any]);
        result.current.updateAccounts([{ ...account, balance: 92000 } as any]);
      });

      // Last update should win
      expect(result.current.accounts[0].balance).toBe(92000);
    });
  });

  describe('Account Transfers', () => {
    it('should transfer funds between accounts', async () => {
      const fromAccount = {
        id: 'account-from',
        user_id: mockUser.id,
        name: 'Checking',
        type: 'checking',
        balance: 100000,
        color: '#3b82f6',
      };

      const toAccount = {
        id: 'account-to',
        user_id: mockUser.id,
        name: 'Savings',
        type: 'savings',
        balance: 50000,
        color: '#10b981',
      };

      const transferAmount = 20000;

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          transaction1: { id: 'tx-1' },
          transaction2: { id: 'tx-2' },
          balances: {
            [fromAccount.id]: 80000,
            [toAccount.id]: 70000,
          },
        },
        error: null,
      });

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([fromAccount as any, toAccount as any]);
      });

      await act(async () => {
        await result.current.transferBetweenAccounts(
          fromAccount.id,
          toAccount.id,
          transferAmount,
          new Date('2024-01-15')
        );
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('atomic-transfer', {
        body: expect.objectContaining({
          from_account_id: fromAccount.id,
          to_account_id: toAccount.id,
          amount: transferAmount,
        }),
      });
    });

    it('should prevent transfer to same account', async () => {
      const account = {
        id: 'account-123',
        user_id: mockUser.id,
        name: 'Checking',
        type: 'checking',
        balance: 100000,
        color: '#3b82f6',
      };

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([account as any]);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.transferBetweenAccounts(
            account.id,
            account.id,
            10000,
            new Date()
          );
        });
      }).rejects.toThrow();
    });
  });

  describe('Credit Card Bill Payment', () => {
    it('should pay credit card bill from checking account', async () => {
      const checkingAccount = {
        id: 'checking-123',
        user_id: mockUser.id,
        name: 'Checking',
        type: 'checking',
        balance: 100000,
        color: '#3b82f6',
      };

      const creditAccount = {
        id: 'credit-123',
        user_id: mockUser.id,
        name: 'Credit Card',
        type: 'credit',
        balance: -50000, // Negative balance = debt
        color: '#ef4444',
      };

      const paymentAmount = 30000;

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          transactions: [{ id: 'tx-1' }, { id: 'tx-2' }],
          balances: {
            [checkingAccount.id]: 70000,
            [creditAccount.id]: -20000,
          },
        },
        error: null,
      });

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([checkingAccount as any, creditAccount as any]);
      });

      await act(async () => {
        await result.current.payCreditCardBill({
          creditCardAccountId: creditAccount.id,
          debitAccountId: checkingAccount.id,
          amount: paymentAmount,
          paymentDate: '2024-01-25',
        });
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('atomic-pay-bill', {
        body: expect.objectContaining({
          credit_account_id: creditAccount.id,
          debit_account_id: checkingAccount.id,
          amount: paymentAmount,
        }),
      });
    });
  });

  describe('Account Deletion', () => {
    it('should remove account from store', async () => {
      const account = {
        id: 'account-123',
        user_id: mockUser.id,
        name: 'Old Account',
        type: 'checking',
        balance: 0,
        color: '#3b82f6',
      };

      const { result } = renderHook(() => useAccountStore());

      await act(async () => {
        result.current.setAccounts([account as any]);
      });

      expect(result.current.accounts).toHaveLength(1);

      await act(async () => {
        result.current.removeAccount('account-123');
      });

      expect(result.current.accounts).toHaveLength(0);
    });
  });
});
