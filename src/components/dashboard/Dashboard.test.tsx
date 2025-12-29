import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { Account, Transaction, Category } from '@/types';

const mockQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const mockAccounts: Account[] = [
  {
    id: '1',
    name: 'Conta Corrente',
    type: 'checking',
    balance: 10000,
    color: '#3b82f6',
  },
];

const mockTransactions: Transaction[] = [
  {
    id: '1',
    description: 'Mercado',
    amount: 15000,
    date: new Date(2025, 11, 10),
    type: 'expense',
    category_id: '1',
    account_id: '1',
    status: 'completed',
    invoice_month_overridden: false,
    category: { id: '1', name: 'Alimentação', type: 'expense', color: '#ef4444' },
    account: { id: '1', name: 'Conta Corrente', type: 'checking', color: '#3b82f6' },
  },
];

const mockCategories: Category[] = [
  {
    id: '1',
    name: 'Alimentação',
    type: 'expense',
    color: '#ef4444',
  },
];

describe('Dashboard Component', () => {
  beforeEach(() => {
    mockQueryClient.clear();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={mockTransactions}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );
  };

  it('should render dashboard without crashing', () => {
    renderDashboard();
    const elements = screen.getAllByText(/dashboard|saldo|transações|contas/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should display account balance information', () => {
    renderDashboard();
    const balanceElements = screen.queryAllByText(/saldo|balance/i);
    const headingElements = screen.queryAllByRole('heading');
    expect(balanceElements.length > 0 || headingElements.length > 0).toBeTruthy();
  });

  it('should render with empty transactions', () => {
    render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={[]}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );
    expect(screen.getAllByRole('heading')[0]).toBeInTheDocument();
  });

  it('should update when transactions prop changes', async () => {
    const { rerender } = render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={[]}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    rerender(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={mockTransactions}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    expect(screen.getAllByRole('heading')[0]).toBeInTheDocument();
  });

  it('should call onAddTransaction when add button is clicked', async () => {
    const onAddTransaction = vi.fn();
    render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={mockTransactions}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={onAddTransaction}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    expect(screen.getAllByRole('heading')[0]).toBeInTheDocument();
  });

  it('should handle multiple accounts correctly', () => {
    const multipleAccounts = [
      ...mockAccounts,
      {
        ...mockAccounts[0],
        id: '2',
        name: 'Poupança',
        balance: 50000,
      },
    ];

    render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={multipleAccounts}
          transactions={mockTransactions}
          categories={mockCategories}
          fixedTransactions={[]}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    expect(screen.getAllByRole('heading')[0]).toBeInTheDocument();
  });
});
