import { create } from 'zustand';
import { Account } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';

/**
 * @deprecated This store is deprecated and will be removed in future versions.
 * Please use React Query hooks (useAccounts) and useOfflineAccountMutations instead.
 * This file is kept only for backward compatibility with existing tests.
 */
type AddAccountPayload = Omit<Account, 'id' | 'user_id' | 'created_at'>;

interface PayBillParams {
  creditCardAccountId: string;
  debitAccountId: string;
  amount: number;
  paymentDate: string;
}

interface AccountStoreState {
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  addAccount: (payload: AddAccountPayload) => Promise<void>;
  updateAccounts: (updatedAccounts: Account | Account[]) => void;
  removeAccount: (accountId: string) => void;
  payCreditCardBill: (params: PayBillParams) => Promise<{
    updatedCreditAccount: Account;
    updatedDebitAccount: Account;
  }>;
  transferBetweenAccounts: (
    fromAccountId: string,
    toAccountId: string,
    amountInCents: number,
    date: Date,
  ) => Promise<{ fromAccount: Account; toAccount: Account }>;
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  accounts: [],

  setAccounts: (accounts) => set({ accounts }),

  addAccount: async (payload) => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error("Erro ao obter usuário:", authError);
      throw new Error("Usuário não autenticado");
    }

    const { data: newAccount, error: insertError } = await supabase
      .from("accounts")
      .insert({
        ...payload,
        user_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      logger.error("Erro ao adicionar conta no Supabase:", insertError);
      throw insertError;
    }

    if (newAccount) {
      set((state) => ({
        accounts: [...state.accounts, newAccount as Account],
      }));
    }
  },

  updateAccounts: (updatedAccounts) => {
    const accountsToUpdate = Array.isArray(updatedAccounts) ? updatedAccounts : [updatedAccounts];
    const updatedMap = new Map(accountsToUpdate.map(acc => [acc.id, acc]));
    const currentAccounts = get().accounts;
    const newAccounts = currentAccounts.map(account => updatedMap.get(account.id) || account);
    set({ accounts: newAccounts });
  },

  removeAccount: (accountId) =>
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== accountId),
    })),

  payCreditCardBill: async ({
    creditCardAccountId,
    debitAccountId,
    amount,
    paymentDate,
  }: PayBillParams) => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Usuário não autenticado");

    const { data, error } = await supabase.functions.invoke('atomic-pay-bill', {
      body: {
        credit_account_id: creditCardAccountId,
        debit_account_id: debitAccountId,
        amount,
        payment_date: paymentDate,
      },
    });

    if (error) {
      logger.error('Erro ao pagar fatura (edge function):', error);
      throw error;
    }

    if (data?.debit_tx && data?.credit_tx) {
      // Não temos mais TransactionStore, React Query gerencia o cache
      logger.debug('Transactions criadas:', data.debit_tx.id, data.credit_tx.id);
    }

    set((state) => {
      const updated = state.accounts.map(acc => {
        if (acc.id === debitAccountId && data?.debit_balance?.new_balance !== undefined) {
          return { ...acc, balance: data.debit_balance.new_balance } as Account;
        }
        if (acc.id === creditCardAccountId && data?.credit_balance?.new_balance !== undefined) {
          return { ...acc, balance: data.credit_balance.new_balance } as Account;
        }
        return acc;
      });
      return { accounts: updated };
    });

    const updatedDebitAccount = get().accounts.find(a => a.id === debitAccountId)!;
    const updatedCreditAccount = get().accounts.find(a => a.id === creditCardAccountId)!;

    return { updatedCreditAccount, updatedDebitAccount };
  },

  transferBetweenAccounts: async (
    fromAccountId,
    toAccountId,
    amountInCents,
    date,
  ) => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Usuário não autenticado");

    const dateString = format(date, 'yyyy-MM-dd');

    const { data, error } = await supabase.functions.invoke('atomic-transfer', {
      body: {
        transfer: {
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          amount: amountInCents,
          date: dateString,
          description: `Transferência ${dateString}`,
        },
      },
    });

    if (error) {
      logger.error('Erro na transferência (edge function):', error);
      throw error;
    }

    if (data?.outgoing && data?.incoming) {
      // Não temos mais TransactionStore, React Query gerencia o cache
      logger.debug('Transfer transactions criadas:', data.outgoing.id, data.incoming.id);
    }

    set((state) => {
      const updated = state.accounts.map(acc => {
        if (acc.id === fromAccountId && data?.from_balance?.new_balance !== undefined) {
          return { ...acc, balance: data.from_balance.new_balance } as Account;
        }
        if (acc.id === toAccountId && data?.to_balance?.new_balance !== undefined) {
          return { ...acc, balance: data.to_balance.new_balance } as Account;
        }
        return acc;
      });
      return { accounts: updated };
    });

    const fromAccount = get().accounts.find(a => a.id === fromAccountId)!;
    const toAccount = get().accounts.find(a => a.id === toAccountId)!;

    return { fromAccount, toAccount };
  },
}));
