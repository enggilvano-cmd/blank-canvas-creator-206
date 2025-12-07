import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/lib/formatters';

describe('formatCurrency', () => {
  it('should format currency in BRL (centavos)', () => {
    const result = formatCurrency(123456, 'BRL'); // 1234.56 em centavos
    expect(result).toContain('1.234');
    expect(result).toContain('56');
  });

  it('should format currency in USD', () => {
    const result = formatCurrency(123456, 'USD');
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('56');
  });

  it('should handle zero', () => {
    const result = formatCurrency(0, 'BRL');
    expect(result).toContain('0');
  });

  it('should handle negative values', () => {
    const result = formatCurrency(-50000, 'BRL'); // -500.00
    expect(result).toContain('500');
  });

  it('should handle large numbers', () => {
    const result = formatCurrency(100000000, 'BRL'); // 1.000.000,00
    expect(result).toContain('000');
  });
});
