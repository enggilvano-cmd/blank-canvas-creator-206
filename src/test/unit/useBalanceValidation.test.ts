import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBalanceValidation } from '@/hooks/useBalanceValidation';
import type { Account } from '@/types';

describe('useBalanceValidation', () => {
  const createMockAccount = (overrides?: Partial<Account>): Account => ({
    id: 'test-account-id',
    name: 'Test Account',
    type: 'checking',
    balance: 100000, // R$ 1,000.00
    color: '#3b82f6',
    user_id: 'test-user',
    ...overrides,
  });

  describe('Income transactions', () => {
    it('should always validate income transactions successfully', () => {
      const account = createMockAccount();
      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 50000, // R$ 500.00
          transactionType: 'income',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.status).toBe('success');
      expect(result.current.details.balanceAfter).toBe(150000); // R$ 1,500.00
    });

    it('should handle income for credit cards as payment', () => {
      const account = createMockAccount({
        type: 'credit',
        balance: -50000, // -R$ 500.00 debt
        limit_amount: 200000, // R$ 2,000.00 limit
      });

      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 30000, // R$ 300.00 payment
          transactionType: 'income',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.message).toBe('Pagamento');
      expect(result.current.details.balanceAfter).toBe(-20000); // -R$ 200.00 remaining debt
    });
  });

  describe('Expense transactions - Regular accounts', () => {
    it('should validate sufficient balance for checking account', () => {
      const account = createMockAccount({ type: 'checking', balance: 100000 });
      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 50000,
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.status).toBe('success');
    });

    it('should invalidate insufficient balance for checking account', () => {
      const account = createMockAccount({ type: 'checking', balance: 30000 });
      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 50000,
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(false);
      expect(result.current.status).toBe('danger');
      expect(result.current.message).toContain('Saldo insuficiente');
    });
  });

  describe('Expense transactions - Credit cards', () => {
    it('should validate expense within credit limit', () => {
      const account = createMockAccount({
        type: 'credit',
        balance: -50000, // -R$ 500.00 debt
        limit_amount: 200000, // R$ 2,000.00 limit
      });

      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 100000, // R$ 1,000.00 expense
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.status).toBe('success');
      expect(result.current.details.available).toBe(150000); // R$ 1,500.00 available
    });

    it('should invalidate expense exceeding credit limit', () => {
      const account = createMockAccount({
        type: 'credit',
        balance: -180000, // -R$ 1,800.00 debt
        limit_amount: 200000, // R$ 2,000.00 limit
      });

      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 50000, // R$ 500.00 expense (exceeds R$ 200 available)
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(false);
      expect(result.current.status).toBe('danger');
      expect(result.current.message).toContain('Limite excedido');
    });

    it('should show warning when approaching credit limit', () => {
      const account = createMockAccount({
        type: 'credit',
        balance: -150000, // -R$ 1,500.00 debt
        limit_amount: 200000, // R$ 2,000.00 limit
      });

      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 40000, // R$ 400.00 expense (leaves R$ 100 available = 5%)
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.status).toBe('warning');
      expect(result.current.message).toContain('Próximo ao limite');
    });
  });

  describe('Transaction editing', () => {
    it('should account for existing transaction when editing', () => {
      const account = createMockAccount({
        type: 'credit',
        balance: -150000,
        limit_amount: 200000,
      });

      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 80000, // New amount R$ 800.00
          transactionType: 'expense',
          excludeTransactionId: 'existing-tx-id',
          existingTransactionAmount: 50000, // Original amount R$ 500.00
          existingTransactionType: 'expense',
        })
      );

      // Only the difference (R$ 300.00) should impact the available credit
      expect(result.current.isValid).toBe(true);
      expect(result.current.details.balanceAfter).toBe(-180000);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined account gracefully', () => {
      const { result } = renderHook(() =>
        useBalanceValidation({
          account: undefined,
          amountInCents: 50000,
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.message).toBe('Selecione uma conta');
    });

    it('should handle zero amount', () => {
      const account = createMockAccount();
      const { result } = renderHook(() =>
        useBalanceValidation({
          account,
          amountInCents: 0,
          transactionType: 'expense',
        })
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.details.balanceAfter).toBe(account.balance);
    });
  });
});
