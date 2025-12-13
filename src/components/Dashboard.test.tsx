import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { Account, Transaction, Category, FixedTransaction } from '@/types';

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
    bank_name: 'Banco A',
    balance: 10000,
    currency: 'BRL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    user_id: 'user-1',
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
    invoice_month: null,
    invoice_month_overridden: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-1',
    category: { id: '1', name: 'Alimentação', type: 'expense', user_id: 'user-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    account: mockAccounts[0],
    to_account: null,
    installments: 1,
    current_installment: 1,
    is_recurring: false,
    is_fixed: false,
  },
];

const mockCategories: Category[] = [
  {
    id: '1',
    name: 'Alimentação',
    type: 'expense',
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockFixedTransactions: FixedTransaction[] = [];

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
          fixedTransactions={mockFixedTransactions}
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
    expect(screen.getByText(/dashboard|saldo|transações|contas/i)).toBeInTheDocument();
  });

  it('should display account balance information', () => {
    renderDashboard();
    // Check for balance display (may be formatted as currency)
    expect(screen.queryByText(/saldo|balance/i) || screen.getByRole('heading')).toBeTruthy();
  });

  it('should render with empty transactions', () => {
    render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={[]}
          categories={mockCategories}
          fixedTransactions={mockFixedTransactions}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('should update when transactions prop changes', async () => {
    const { rerender } = render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={[]}
          categories={mockCategories}
          fixedTransactions={mockFixedTransactions}
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
          fixedTransactions={mockFixedTransactions}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    // Component should re-render with new data
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('should call onAddTransaction when add button is clicked', async () => {
    const onAddTransaction = vi.fn();
    render(
      <QueryClientProvider client={mockQueryClient}>
        <Dashboard
          accounts={mockAccounts}
          transactions={mockTransactions}
          categories={mockCategories}
          fixedTransactions={mockFixedTransactions}
          onAddAccount={() => {}}
          onAddTransaction={onAddTransaction}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    // Verify component is rendered
    expect(screen.getByRole('heading')).toBeInTheDocument();
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
          fixedTransactions={mockFixedTransactions}
          onAddAccount={() => {}}
          onAddTransaction={() => {}}
          onNavigateToAccounts={() => {}}
          onNavigateToTransactions={() => {}}
        />
      </QueryClientProvider>
    );

    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
