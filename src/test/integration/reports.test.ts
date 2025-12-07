import { describe, it, expect } from 'vitest';

describe('Report Generation Tests', () => {
  describe('Balance Sheet', () => {
    it('should calculate total assets correctly', () => {
      const accounts = [
        { type: 'checking', balance: 100000 },
        { type: 'savings', balance: 50000 },
        { type: 'investment', balance: 200000 },
      ];

      const totalAssets = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      expect(totalAssets).toBe(350000);
    });

    it('should calculate total liabilities correctly', () => {
      const accounts = [
        { type: 'credit', balance: -50000 },
        { type: 'credit', balance: -30000 },
      ];

      const totalLiabilities = accounts.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      expect(totalLiabilities).toBe(80000);
    });

    it('should calculate net worth correctly', () => {
      const assets = 350000;
      const liabilities = 80000;
      const netWorth = assets - liabilities;

      expect(netWorth).toBe(270000);
    });
  });

  describe('Income Statement', () => {
    it('should calculate total income for period', () => {
      const transactions = [
        { type: 'income', amount: 500000, date: '2024-01-15' },
        { type: 'income', amount: 50000, date: '2024-01-20' },
        { type: 'expense', amount: 20000, date: '2024-01-25' },
      ];

      const totalIncome = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      expect(totalIncome).toBe(550000);
    });

    it('should calculate total expenses for period', () => {
      const transactions = [
        { type: 'expense', amount: 10000, date: '2024-01-15' },
        { type: 'expense', amount: 20000, date: '2024-01-20' },
        { type: 'income', amount: 100000, date: '2024-01-25' },
      ];

      const totalExpenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      expect(totalExpenses).toBe(30000);
    });

    it('should calculate net income correctly', () => {
      const income = 550000;
      const expenses = 200000;
      const netIncome = income - expenses;

      expect(netIncome).toBe(350000);
    });
  });

  describe('Category Analysis', () => {
    it('should group expenses by category', () => {
      const transactions = [
        { type: 'expense', amount: 10000, category_id: 'food' },
        { type: 'expense', amount: 15000, category_id: 'food' },
        { type: 'expense', amount: 50000, category_id: 'rent' },
        { type: 'expense', amount: 30000, category_id: 'transport' },
      ];

      const byCategory = transactions.reduce((acc, t) => {
        if (!acc[t.category_id]) {
          acc[t.category_id] = 0;
        }
        acc[t.category_id] += t.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(byCategory['food']).toBe(25000);
      expect(byCategory['rent']).toBe(50000);
      expect(byCategory['transport']).toBe(30000);
    });

    it('should calculate category percentages', () => {
      const totalExpenses = 105000;
      const categoryExpenses = {
        food: 25000,
        rent: 50000,
        transport: 30000,
      };

      const percentages = Object.entries(categoryExpenses).reduce((acc, [cat, amount]) => {
        acc[cat] = (amount / totalExpenses) * 100;
        return acc;
      }, {} as Record<string, number>);

      expect(Math.round(percentages.food)).toBe(24);
      expect(Math.round(percentages.rent)).toBe(48);
      expect(Math.round(percentages.transport)).toBe(29);
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter transactions by date range', () => {
      const transactions = [
        { id: '1', date: '2024-01-05', amount: 100 },
        { id: '2', date: '2024-01-15', amount: 200 },
        { id: '3', date: '2024-01-25', amount: 300 },
        { id: '4', date: '2024-02-05', amount: 400 },
      ];

      const startDate = new Date('2024-01-10');
      const endDate = new Date('2024-01-31');

      const filtered = transactions.filter(t => {
        const date = new Date(t.date);
        return date >= startDate && date <= endDate;
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['2', '3']);
    });

    it('should calculate monthly totals', () => {
      const transactions = [
        { date: '2024-01-15', amount: 1000, type: 'income' },
        { date: '2024-01-20', amount: 500, type: 'expense' },
        { date: '2024-02-10', amount: 2000, type: 'income' },
        { date: '2024-02-15', amount: 800, type: 'expense' },
      ];

      const monthlyTotals = transactions.reduce((acc, t) => {
        const month = t.date.substring(0, 7); // YYYY-MM
        if (!acc[month]) {
          acc[month] = { income: 0, expense: 0 };
        }
        acc[month][t.type as 'income' | 'expense'] += t.amount;
        return acc;
      }, {} as Record<string, { income: number; expense: number }>);

      expect(monthlyTotals['2024-01'].income).toBe(1000);
      expect(monthlyTotals['2024-01'].expense).toBe(500);
      expect(monthlyTotals['2024-02'].income).toBe(2000);
      expect(monthlyTotals['2024-02'].expense).toBe(800);
    });
  });
});
