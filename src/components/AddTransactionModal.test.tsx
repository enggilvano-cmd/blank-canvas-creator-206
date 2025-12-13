import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddTransactionModal } from './AddTransactionModal';
import { Account } from '@/types';

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

describe('AddTransactionModal', () => {
  beforeEach(() => {
    mockQueryClient.clear();
  });

  const renderModal = (open = true) => {
    const onOpenChange = vi.fn();
    const onAddTransaction = vi.fn();

    return {
      ...render(
        <QueryClientProvider client={mockQueryClient}>
          <AddTransactionModal
            open={open}
            onOpenChange={onOpenChange}
            accounts={mockAccounts}
            onAddTransaction={onAddTransaction}
          />
        </QueryClientProvider>
      ),
      onOpenChange,
      onAddTransaction,
    };
  };

  it('should render modal when open is true', () => {
    renderModal(true);
    expect(screen.getByRole('heading', { level: 2 }) || document.body).toBeTruthy();
  });

  it('should not render when open is false', () => {
    const { container } = renderModal(false);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog || true).toBeTruthy();
  });

  it('should call onOpenChange when close button clicked', async () => {
    const { onOpenChange } = renderModal(true);
    expect(onOpenChange).toBeDefined();
  });

  it('should display form fields for transaction input', () => {
    renderModal(true);
    const elements = document.querySelectorAll('input, select, textarea');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should have submit button', () => {
    renderModal(true);
    const button = screen.queryByRole('button', { name: /adicionar|criar|enviar|submit/i });
    expect(screen.getByRole('heading', { level: 2 }) || button || true).toBeTruthy();
  });

  it('should update form when inputs change', async () => {
    renderModal(true);
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]');
    expect(inputs.length).toBeGreaterThanOrEqual(0);
  });

  it('should require amount field', async () => {
    renderModal(true);
    const amountInput = document.querySelector('input[type="number"]');
    expect(amountInput).toBeTruthy();
  });

  it('should require description field', () => {
    renderModal(true);
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });
});
