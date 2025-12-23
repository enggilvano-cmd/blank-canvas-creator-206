import { renderHook } from '@testing-library/react-hooks';
import { useDashboardCalculations } from './useDashboardCalculations';
import type { Account } from '@/types';

describe('useDashboardCalculations', () => {
  it('should calculate totalBalance correctly including investment accounts', () => {
    const accounts: Account[] = [
      { id: '1', name: 'Checking', balance: 1000, type: 'checking', created_at: '', user_id: '' },
      { id: '2', name: 'Savings', balance: 2000, type: 'savings', created_at: '', user_id: '' },
      { id: '3', name: 'Investment', balance: 5000, type: 'investment', created_at: '', user_id: '' },
      { id: '4', name: 'Credit Card', balance: -500, type: 'credit', created_at: '', user_id: '' },
      { id: '5', name: 'Meal Voucher', balance: 300, type: 'meal_voucher', created_at: '', user_id: '' },
    ];

    const dateRange = { dateFrom: undefined, dateTo: undefined };
    
    const { result } = renderHook(() => 
      useDashboardCalculations(
        accounts, 
        dateRange, 
        'key', 
        [], 
        undefined, 
        'all', 
        new Date(), 
        undefined, 
        undefined
      )
    );

    expect(result.current.totalBalance).toBe((1000 + 2000 + 5000 + 300) * 100);
  });
});
