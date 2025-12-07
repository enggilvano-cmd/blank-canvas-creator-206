import { describe, it, expect } from 'vitest';
import {
  getUserTimezone,
  normalizeFormDate,
  parseDateString,
  getTodayInUserTimezone,
  isSameDay,
  addDaysInUserTimezone,
  isDateInRange,
} from '@/lib/timezone';

describe('Timezone Utilities', () => {
  describe('getUserTimezone', () => {
    it('should return a valid timezone string', () => {
      const timezone = getUserTimezone();
      expect(timezone).toBeTruthy();
      expect(typeof timezone).toBe('string');
    });
  });

  describe('normalizeFormDate', () => {
    it('should normalize Date object to YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T10:30:00');
      const normalized = normalizeFormDate(date);
      expect(normalized).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(normalized).toBe('2024-01-15');
    });

    it('should keep YYYY-MM-DD string unchanged', () => {
      const dateStr = '2024-01-15';
      const normalized = normalizeFormDate(dateStr);
      expect(normalized).toBe('2024-01-15');
    });

    it('should parse ISO string to YYYY-MM-DD', () => {
      const isoStr = '2024-01-15T10:30:00.000Z';
      const normalized = normalizeFormDate(isoStr);
      expect(normalized).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseDateString', () => {
    it('should parse YYYY-MM-DD string to Date', () => {
      const dateStr = '2024-01-15';
      const parsed = parseDateString(dateStr);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(0); // Janeiro
      expect(parsed.getDate()).toBe(15);
    });
  });

  describe('getTodayInUserTimezone', () => {
    it('should return today in YYYY-MM-DD format', () => {
      const today = getTodayInUserTimezone();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isSameDay', () => {
    it('should return true for same dates', () => {
      const date1 = '2024-01-15';
      const date2 = new Date('2024-01-15T10:30:00');
      expect(isSameDay(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = '2024-01-15';
      const date2 = '2024-01-16';
      expect(isSameDay(date1, date2)).toBe(false);
    });
  });

  describe('addDaysInUserTimezone', () => {
    it('should add days to a date', () => {
      const date = '2024-01-15';
      const result = addDaysInUserTimezone(date, 5);
      expect(result).toBeInstanceOf(Date);
      expect(result.getDate()).toBe(20);
    });

    it('should handle month transitions', () => {
      const date = '2024-01-30';
      const result = addDaysInUserTimezone(date, 5);
      expect(result.getMonth()).toBe(1); // Fevereiro
      expect(result.getDate()).toBe(4);
    });
  });

  describe('isDateInRange', () => {
    it('should return true for date within range', () => {
      const date = '2024-01-15';
      const start = '2024-01-01';
      const end = '2024-01-31';
      expect(isDateInRange(date, start, end)).toBe(true);
    });

    it('should return false for date outside range', () => {
      const date = '2024-02-01';
      const start = '2024-01-01';
      const end = '2024-01-31';
      expect(isDateInRange(date, start, end)).toBe(false);
    });

    it('should include boundary dates', () => {
      const start = '2024-01-01';
      const end = '2024-01-31';
      expect(isDateInRange(start, start, end)).toBe(true);
      expect(isDateInRange(end, start, end)).toBe(true);
    });
  });
});
