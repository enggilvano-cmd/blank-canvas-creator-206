import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBalanceForEdit } from '@/hooks/useBalanceValidation';
import { supabase } from '@/integrations/supabase/client';
import { Account } from '@/types';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('useBalanceValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateBalanceForEdit - Regular Account', () => {
    const regularAccount: Account = {
      id: 'acc-123',
      name: 'Checking Account',
      type: 'checking',
      balance: 100000, // R$ 1000.00
      limit_amount: undefined,
      color: '#000000',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      user_id: 'user-123',
      closing_date: undefined,
      due_date: undefined,
    };

    it('should validate sufficient balance for expense', async () => {
      const result = await validateBalanceForEdit(
        regularAccount,
        50000, // R$ 500.00 new amount
        0, // no old amount
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      expect(result.isValid).toBe(true);
    });

    it('should reject insufficient balance', async () => {
      const result = await validateBalanceForEdit(
        regularAccount,
        150000, // R$ 1500.00 - more than available
        0,
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Saldo insuficiente');
    });

    it('should consider old transaction amount when editing', async () => {
      const result = await validateBalanceForEdit(
        regularAccount,
        120000, // R$ 1200.00 new amount
        70000, // R$ 700.00 old amount
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      // Available: 1000 + 700 (refund) = 1700
      // Needed: 1200
      // Should be valid
      expect(result.isValid).toBe(true);
    });

    it('should allow income transactions regardless of balance', async () => {
      const result = await validateBalanceForEdit(
        regularAccount,
        999999999,
        0,
        'income',
        'income',
        'tx-123',
        'completed'
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe('validateBalanceForEdit - Credit Card', () => {
    const creditAccount: Account = {
      id: 'credit-123',
      name: 'Credit Card',
      type: 'credit',
      balance: -50000, // R$ 500.00 used (negative)
      limit_amount: 200000, // R$ 2000.00 limit
      color: '#FF0000',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      user_id: 'user-123',
      closing_date: 15,
      due_date: 25,
    };

    it('should validate available credit for expense', async () => {
      const mockFrom = vi.mocked(supabase.from);
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        data: [],
        error: null,
        then: function(resolve: any) { resolve({ data: [], error: null }) }
      };
      
      mockFrom.mockReturnValue(mockChain as any);

      const result = await validateBalanceForEdit(
        creditAccount,
        100000, // R$ 1000.00
        0,
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      // Available: 2000 - 500 = 1500
      // Needed: 1000
      // Should be valid
      expect(result.isValid).toBe(true);
    });

    it('should reject when exceeding credit limit', async () => {
      const mockFrom = vi.mocked(supabase.from);
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        data: [],
        error: null,
        then: function(resolve: any) { resolve({ data: [], error: null }) }
      };
      
      mockFrom.mockReturnValue(mockChain as any);

      const result = await validateBalanceForEdit(
        creditAccount,
        200000, // R$ 2000.00 - would exceed limit
        0,
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain('Limite excedido');
    });

    it('should consider pending transactions when validating credit', async () => {
      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: [
              { amount: 30000 }, // R$ 300.00 pending
              { amount: 20000 }, // R$ 200.00 pending
            ],
            error: null,
          })),
        })),
      } as never);

      const result = await validateBalanceForEdit(
        creditAccount,
        120000, // R$ 1200.00
        0,
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      // Used: 500 (current) + 300 + 200 (pending) = 1000
      // Available: 2000 - 1000 = 1000
      // Needed: 1200
      // Should be invalid
      expect(result.isValid).toBe(false);
    });

    it('should handle credit card payment (income) correctly', async () => {
      const result = await validateBalanceForEdit(
        creditAccount,
        50000, // R$ 500.00 payment
        0,
        'income',
        'income',
        'tx-123',
        'completed'
      );

      // Payments should always be valid
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateBalanceForEdit - Type Changes', () => {
    const account: Account = {
      id: 'acc-123',
      name: 'Test Account',
      type: 'checking',
      balance: 100000,
      limit_amount: undefined,
      color: '#000000',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      user_id: 'user-123',
      closing_date: undefined,
      due_date: undefined,
    };

    it('should handle changing from income to expense', async () => {
      const result = await validateBalanceForEdit(
        account,
        80000, // R$ 800.00
        50000, // R$ 500.00 (was income, now expense)
        'expense',
        'income',
        'tx-123',
        'completed'
      );

      // Changing from income to expense effectively reduces balance
      // Previous: +500, New: -800
      // Net change: -1300
      // Available: 1000
      // Should be invalid
      expect(result.isValid).toBe(false);
    });

    it('should handle changing from expense to income', async () => {
      const result = await validateBalanceForEdit(
        account,
        50000, // R$ 500.00 (now income)
        80000, // R$ 800.00 (was expense)
        'income',
        'expense',
        'tx-123',
        'completed'
      );

      // Changing from expense to income increases balance
      // Always valid for income
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateBalanceForEdit - Pending Transactions', () => {
    const account: Account = {
      id: 'acc-123',
      name: 'Test Account',
      type: 'checking',
      balance: 100000,
      limit_amount: undefined,
      color: '#000000',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      user_id: 'user-123',
      closing_date: undefined,
      due_date: undefined,
    };

    it('should not affect balance for pending transaction edits', async () => {
      const result = await validateBalanceForEdit(
        account,
        150000, // R$ 1500.00
        0,
        'expense',
        'expense',
        'tx-123',
        'pending' // PENDING transaction
      );

      // Pending transactions don't affect current balance
      // Should only check if it would be valid when completed
      expect(result.isValid).toBe(false);
    });

    it('should consider completed status changes', async () => {
      const result = await validateBalanceForEdit(
        account,
        80000, // R$ 800.00
        0,
        'expense',
        'expense',
        'tx-123',
        'completed'
      );

      expect(result.isValid).toBe(true);
    });
  });
});
