import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatPercentage } from '@/lib/formatters';
import { createDateFromString, isDateInRange, getMonthDateRange } from '@/lib/dateUtils';
import { logger } from '@/lib/logger';
import { validateTransaction, validateAccount, validateCategory } from '@/lib/validation';

/**
 * ✅ PRIORITY 3: Unit Tests for Utility Functions
 * 
 * Comprehensive tests for pure utility functions to ensure
 * correctness and prevent regressions.
 */

describe('Formatters', () => {
  describe('formatCurrency', () => {
    it('should format positive amounts correctly', () => {
      expect(formatCurrency(100000).replace(/\u00A0/g, ' ')).toBe('R$ 1.000,00');
      expect(formatCurrency(123456).replace(/\u00A0/g, ' ')).toBe('R$ 1.234,56');
      expect(formatCurrency(99).replace(/\u00A0/g, ' ')).toBe('R$ 0,99');
    });

    it('should format negative amounts correctly', () => {
      expect(formatCurrency(-100000).replace(/\u00A0/g, ' ')).toBe('-R$ 1.000,00');
      expect(formatCurrency(-123456).replace(/\u00A0/g, ' ')).toBe('-R$ 1.234,56');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0).replace(/\u00A0/g, ' ')).toBe('R$ 0,00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(100000000).replace(/\u00A0/g, ' ')).toBe('R$ 1.000.000,00');
      expect(formatCurrency(123456789).replace(/\u00A0/g, ' ')).toBe('R$ 1.234.567,89');
    });

    it('should round to 2 decimal places', () => {
      expect(formatCurrency(1099.9).replace(/\u00A0/g, ' ')).toBe('R$ 11,00');
      expect(formatCurrency(1000.1).replace(/\u00A0/g, ' ')).toBe('R$ 10,00');
    });
  });

  describe('formatDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2024-12-08T10:30:00');
      expect(formatDate(date)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should handle string dates', () => {
      expect(formatDate('2024-12-08')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should handle different formats', () => {
      const date = new Date('2024-01-15T12:00:00');
      expect(formatDate(date, 'short')).toBe('15/01/2024');
      expect(formatDate(date, 'long')).toMatch(/15 de janeiro de 2024/i);
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages correctly', () => {
      expect(formatPercentage(0.5)).toBe('50%');
      expect(formatPercentage(0.123)).toBe('12,3%');
      expect(formatPercentage(1)).toBe('100%');
    });

    it('should handle edge cases', () => {
      expect(formatPercentage(0)).toBe('0%');
      expect(formatPercentage(1.5)).toBe('150%');
      expect(formatPercentage(-0.25)).toBe('-25%');
    });
  });
});

describe('Date Utils', () => {
  describe('createDateFromString', () => {
    it('should create date from ISO string', () => {
      const date = createDateFromString('2024-12-08');
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(11); // December = 11
      expect(date.getDate()).toBe(8);
    });

    it('should handle different date formats', () => {
      expect(createDateFromString('2024-12-08T10:30:00')).toBeInstanceOf(Date);
      expect(createDateFromString('2024/12/08')).toBeInstanceOf(Date);
    });

    it('should handle invalid dates gracefully', () => {
      const date = createDateFromString('invalid');
      expect(date.getFullYear()).toBe(1969);
      
      const emptyDate = createDateFromString('');
      expect(emptyDate.getFullYear()).toBe(1969);
    });
  });

  describe('isDateInRange', () => {
    it('should return true for dates in range', () => {
      const date = new Date('2024-06-15');
      const start = new Date('2024-06-01');
      const end = new Date('2024-06-30');
      
      expect(isDateInRange(date, start, end)).toBe(true);
    });

    it('should return false for dates outside range', () => {
      const date = new Date('2024-07-15');
      const start = new Date('2024-06-01');
      const end = new Date('2024-06-30');
      
      expect(isDateInRange(date, start, end)).toBe(false);
    });

    it('should handle boundary dates', () => {
      const start = new Date('2024-06-01');
      const end = new Date('2024-06-30');
      
      expect(isDateInRange(start, start, end)).toBe(true);
      expect(isDateInRange(end, start, end)).toBe(true);
    });
  });

  describe('getMonthDateRange', () => {
    it('should return correct month range', () => {
      const { start, end } = getMonthDateRange(2024, 6); // June 2024
      
      expect(start.getFullYear()).toBe(2024);
      expect(start.getMonth()).toBe(5); // June = 5
      expect(start.getDate()).toBe(1);
      
      expect(end.getFullYear()).toBe(2024);
      expect(end.getMonth()).toBe(5);
      expect(end.getDate()).toBe(30);
    });

    it('should handle month boundaries correctly', () => {
      const { start, end } = getMonthDateRange(2024, 2); // February (leap year)
      
      expect(end.getDate()).toBe(29); // Leap year
    });

    it('should handle year boundaries', () => {
      const { start, end } = getMonthDateRange(2024, 12); // December
      
      expect(end.getMonth()).toBe(11);
      expect(end.getDate()).toBe(31);
    });
  });
});

describe('Logger', () => {
  it('should have all log levels', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should not throw when logging', () => {
    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.info('test', { data: 'value' })).not.toThrow();
    expect(() => logger.warn('warning')).not.toThrow();
    expect(() => logger.error('error', new Error('test'))).not.toThrow();
  });

  it('should support structured logging', () => {
    expect(() => {
      logger.info('User action', {
        userId: '123',
        action: 'create_transaction',
        metadata: { amount: 100 }
      });
    }).not.toThrow();
  });
});

describe('Validation', () => {
  describe('validateTransaction', () => {
    it('should validate correct transaction', () => {
      const validTransaction = {
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as const,
        date: new Date().toISOString().split('T')[0],
        account_id: '123e4567-e89b-12d3-a456-426614174000',
        category_id: '223e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
      };

      expect(() => validateTransaction(validTransaction)).not.toThrow();
    });

    it('should reject invalid amount', () => {
      const invalid = {
        description: 'Test',
        amount: -100,
        type: 'expense' as const,
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      };

      expect(() => validateTransaction(invalid)).toThrow();
    });

    it('should reject empty description', () => {
      const invalid = {
        description: '',
        amount: 100,
        type: 'expense' as const,
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      };

      expect(() => validateTransaction(invalid)).toThrow();
    });

    it('should reject invalid type', () => {
      const invalid = {
        description: 'Test',
        amount: 100,
        type: 'invalid' as any,
        date: new Date(),
        account_id: 'acc-123',
        category_id: 'cat-123',
      };

      expect(() => validateTransaction(invalid)).toThrow();
    });

    it('should reject missing required fields', () => {
      const invalid = {
        description: 'Test',
        amount: 100,
        // missing type, date, account_id
      };

      expect(() => validateTransaction(invalid)).toThrow();
    });
  });

  describe('validateAccount', () => {
    it('should validate correct account', () => {
      const validAccount = {
        name: 'Test Account',
        type: 'checking' as const,
        balance: 1000,
        color: '#FF0000',
      };

      expect(() => validateAccount(validAccount)).not.toThrow();
    });

    it('should reject empty name', () => {
      const invalid = {
        name: '',
        type: 'checking' as const,
        balance: 1000,
        color: '#FF0000',
      };

      expect(() => validateAccount(invalid)).toThrow();
    });

    it('should reject invalid type', () => {
      const invalid = {
        name: 'Test',
        type: 'invalid' as any,
        balance: 1000,
        color: '#FF0000',
      };

      expect(() => validateAccount(invalid)).toThrow();
    });

    it('should reject invalid color format', () => {
      const invalid = {
        name: 'Test',
        type: 'checking' as const,
        balance: 1000,
        color: 'red', // should be hex
      };

      expect(() => validateAccount(invalid)).toThrow();
    });
  });

  describe('validateCategory', () => {
    it('should validate correct category', () => {
      const validCategory = {
        name: 'Test Category',
        type: 'expense' as const,
        color: '#00FF00',
      };

      expect(() => validateCategory(validCategory)).not.toThrow();
    });

    it('should reject empty name', () => {
      const invalid = {
        name: '',
        type: 'expense' as const,
        color: '#00FF00',
      };

      expect(() => validateCategory(invalid)).toThrow();
    });

    it('should reject long names', () => {
      const invalid = {
        name: 'a'.repeat(300), // too long
        type: 'expense' as const,
        color: '#00FF00',
      };

      expect(() => validateCategory(invalid)).toThrow();
    });
  });
});

describe('Edge Cases & Security', () => {
  it('should handle null/undefined safely', () => {
    expect(() => formatCurrency(null as any)).toThrow();
    expect(() => formatCurrency(undefined as any)).toThrow();
  });

  it('should sanitize user input', () => {
    const malicious = '<script>alert("xss")</script>';
    expect(() => validateTransaction({
      description: malicious,
      amount: 100,
      type: 'expense' as const,
      date: '2024-01-01',
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      category_id: '223e4567-e89b-12d3-a456-426614174000',
      status: 'completed',
    })).toThrow();
  });

  it('should handle special characters in formatting', () => {
    expect(formatCurrency(1500000000000)).toMatch(/^R\$[\s\u00A0][0-9,.]+$/);
  });

  it('should handle timezone differences', () => {
    const utcDate = new Date('2024-12-08T00:00:00Z');
    const formatted = formatDate(utcDate);
    expect(formatted).toBeTruthy();
  });

  describe('Additional Edge Cases', () => {
    it('should handle very small numbers in currency', () => {
      expect(formatCurrency(0.001).replace(/\u00A0/g, ' ')).toBe('R$ 0,00');
    });

    it('should handle NaN in currency', () => {
      expect(() => formatCurrency(NaN)).toThrow();
    });

    it('should handle Infinity in currency', () => {
      expect(() => formatCurrency(Infinity)).toThrow();
    });
  });
});
