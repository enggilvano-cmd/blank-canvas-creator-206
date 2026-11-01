import { describe, it, expect } from 'vitest';
import { createDateFromString, getTodayString, calculateInvoiceMonthByDue, getInvoiceMonthOptions } from '@/lib/dateUtils';

describe('dateUtils', () => {
  describe('getInvoiceMonthOptions', () => {
    const baseDate = new Date(2026, 10, 1); // Novembro/2026

    it('should offer invoices from 12 months back to 12 months ahead', () => {
      const values = getInvoiceMonthOptions(undefined, baseDate).map((option) => option.value);

      expect(values).toHaveLength(25);
      expect(values[0]).toBe('2025-11');
      expect(values[values.length - 1]).toBe('2027-11');
      expect(values).toContain('2026-06');
    });

    it('should keep a selected month outside the window, in order', () => {
      const values = getInvoiceMonthOptions('2024-03', baseDate).map((option) => option.value);

      expect(values).toHaveLength(26);
      expect(values[0]).toBe('2024-03');
    });

    it('should not duplicate a selected month inside the window', () => {
      const values = getInvoiceMonthOptions('2026-06', baseDate).map((option) => option.value);

      expect(values.filter((value) => value === '2026-06')).toHaveLength(1);
    });

    it('should capitalize labels in pt-BR', () => {
      const june = getInvoiceMonthOptions(undefined, baseDate).find((option) => option.value === '2026-06');

      expect(june?.label).toBe('Junho de 2026');
    });
  });

  describe('createDateFromString', () => {
    it('should parse ISO date strings', () => {
      const date = createDateFromString('2024-01-15');
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // Janeiro
    });

    it('should handle invalid inputs gracefully', () => {
      const date = createDateFromString('invalid');
      expect(date).toBeInstanceOf(Date);
      // Check timestamp instead of year to avoid timezone issues (1969 vs 1970)
      expect(date.getTime()).toBe(0); 
    });

    it('should handle null inputs', () => {
      const date = createDateFromString(null);
      expect(date).toBeInstanceOf(Date);
    });

    it('should return Date objects as-is', () => {
      const inputDate = new Date('2024-01-15');
      const outputDate = createDateFromString(inputDate);
      expect(outputDate).toBeInstanceOf(Date);
    });
  });

  describe('getTodayString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const today = getTodayString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('calculateInvoiceMonthByDue', () => {
    it('should calculate correct invoice month for purchases before closing', () => {
      // Use noon to avoid timezone shifts
      const purchaseDate = new Date('2024-11-12T12:00:00');
      const closingDate = 30;
      const dueDate = 10;
      
      const invoiceMonth = calculateInvoiceMonthByDue(purchaseDate, closingDate, dueDate);
      expect(invoiceMonth).toBe('2024-12'); // Vence em dezembro
    });

    it('should calculate correct invoice month for purchases after closing', () => {
      const purchaseDate = new Date('2024-12-05T12:00:00');
      const closingDate = 30;
      const dueDate = 10;
      
      const invoiceMonth = calculateInvoiceMonthByDue(purchaseDate, closingDate, dueDate);
      expect(invoiceMonth).toBe('2025-01'); // Vence em janeiro
    });

    it('should handle year transitions', () => {
      // Use noon to avoid timezone shifts
      const purchaseDate = new Date('2024-12-31T12:00:00');
      const closingDate = 30;
      const dueDate = 10;
      
      const invoiceMonth = calculateInvoiceMonthByDue(purchaseDate, closingDate, dueDate);
      expect(invoiceMonth).toBe('2025-02'); // Vence em fevereiro do ano seguinte
    });
  });
});
