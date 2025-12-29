import { describe, it, expect } from 'vitest';
import { createDateFromString, getTodayString, calculateInvoiceMonthByDue } from '@/lib/dateUtils';

describe('dateUtils', () => {
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
