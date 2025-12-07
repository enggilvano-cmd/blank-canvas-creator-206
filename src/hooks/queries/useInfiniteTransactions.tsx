import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { createDateFromString } from '@/lib/dateUtils';
import { addTransactionSchema, editTransactionSchema } from '@/lib/validationSchemas';
import { z } from 'zod';

interface UseInfiniteTransactionsParams {
  pageSize?: number;
  search?: string;
  type?: 'income' | 'expense' | 'transfer' | 'all';
  accountId?: string;
  categoryId?: string;
  status?: 'pending' | 'completed' | 'all';
  accountType?: 'checking' | 'savings' | 'credit' | 'investment' | 'all';
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

interface TransactionWithRelations extends Transaction {
  category?: {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
  };
  account?: {
    id: string;
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
    color: string;
  };
  to_account?: {
    id: string;
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
    color: string;
  };
  linked_transactions?: {
    account_id: string;
    accounts?: {
      id: string;
      name: string;
      type: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
      color: string;
    };
  };
}

export function useInfiniteTransactions(params: UseInfiniteTransactionsParams = {}) {
  const {
    pageSize = 50,
    search = '',
    type = 'all',
    accountId = 'all',
    categoryId = 'all',
    status = 'all',
    accountType = 'all',
    dateFrom,
    dateTo,
    sortBy = 'date',
    sortOrder = 'desc',
    enabled = true
  } = params;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const filters = { search, type, accountId, categoryId, status, accountType, dateFrom, dateTo, sortBy, sortOrder };

  // Infinite query for paginated data
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.transactions(filters), 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      if (!user) return { transactions: [], nextCursor: undefined };

      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('transactions')
        .select(`
          id,
          description,
          amount,
          date,
          type,
          status,
          category_id,
          account_id,
          to_account_id,
          installments,
          current_installment,
          parent_transaction_id,
          linked_transaction_id,
          is_recurring,
          is_fixed,
          recurrence_type,
          recurrence_end_date,
          invoice_month,
          invoice_month_overridden,
          created_at,
          updated_at,
          categories:category_id (
            id,
            name,
            type,
            color
          ),
          accounts:account_id!inner (
            id,
            name,
            type,
            color
          ),
          to_accounts:to_account_id (
            id,
            name,
            type,
            color
          ),
          linked_transactions:linked_transaction_id (
            account_id,
            accounts:account_id (
              id,
              name,
              type,
              color
            )
          )
        `)
        .eq('user_id', user.id)
        // Excluir apenas o PAI das transações fixas (mantém as filhas)
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null');

      // Apply filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          // Incluir AMBAS as transações da transferência
          query = query.or('to_account_id.not.is.null,and(type.eq.income,linked_transaction_id.not.is.null)');
        } else {
          query = query.eq('type', type).is('to_account_id', null);
        }
      }

      if (accountId !== 'all') {
        query = query.eq('account_id', accountId);
      }

      if (categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      // ✅ Server-side filter for accountType
      if (accountType !== 'all') {
        query = query.eq('accounts.type', accountType);
      }

      // Apply sorting
      const ascending = sortOrder === 'asc';
      if (sortBy === 'date') {
        query = query.order('date', { ascending }).order('created_at', { ascending });
      } else if (sortBy === 'amount') {
        query = query.order('amount', { ascending });
      }

      // Apply pagination
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching transactions:', error);
        throw error;
      }

      const transactions = (data || []).map((trans: any) => ({
        ...trans,
        date: createDateFromString(trans.date),
        category: Array.isArray(trans.categories) ? trans.categories[0] : trans.categories,
        account: Array.isArray(trans.accounts) ? trans.accounts[0] : trans.accounts,
        to_account: Array.isArray(trans.to_accounts) ? trans.to_accounts[0] : trans.to_accounts,
      })) as TransactionWithRelations[];

      // Determine next cursor
      const nextCursor = transactions.length === pageSize ? pageParam + 1 : undefined;

      return { transactions, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: !!user && enabled,
    // Advanced caching for infinite scroll
    staleTime: (() => {
      // Dynamic stale time based on filters
      if (search) return 10000; // 10s for search (user might scroll and modify)
      if (type !== 'all' || accountId !== 'all') return 30000; // 30s for filtered
      return 120000; // 2min for unfiltered data
    })(),
    gcTime: 600000, // 10 minutes - keep pages longer for infinite scroll
    placeholderData: (previousData) => previousData,
    // Infinite scroll optimizations
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Don't refetch on focus for infinite scroll
    // Enable background refetch for better UX
    refetchOnReconnect: true,
    // Performance
    structuralSharing: true,
    // Optimize for infinite scroll patterns
    maxPages: 10, // Limit memory usage
  });

  // Separate count query
  const countQuery = useInfiniteQuery({
    queryKey: [...queryKeys.transactions(filters), 'count'],
    queryFn: async () => {
      if (!user) return { count: 0 };

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        // Excluir apenas o PAI das transações fixas (mantém as filhas)
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null');

      // Apply same filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          // Incluir AMBAS as transações da transferência (count)
          query = query.or('to_account_id.not.is.null,and(type.eq.income,linked_transaction_id.not.is.null)');
        } else {
          query = query.eq('type', type).is('to_account_id', null);
        }
      }

      if (accountId !== 'all') {
        query = query.eq('account_id', accountId);
      }

      if (categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      const { count, error } = await query;

      if (error) throw error;
      return { count: count || 0 };
    },
    getNextPageParam: () => undefined,
    initialPageParam: 0,
    enabled: !!user && enabled,
    // Otimização: staleTime de 30s evita refetches desnecessários de count
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 2.5 * 60 * 1000,
    // Refetch only when data is stale
    refetchOnMount: true, // Default: refetch se stale
    refetchOnWindowFocus: true,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (transactionData: {
      description: string;
      amount: number;
      date: Date;
      type: 'income' | 'expense' | 'transfer';
      category_id: string;
      account_id: string;
      status: 'pending' | 'completed';
      invoiceMonth?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate with Zod
      const validated = addTransactionSchema.parse({
        description: transactionData.description,
        amount: transactionData.amount,
        date: transactionData.date.toISOString().split('T')[0],
        type: transactionData.type,
        category_id: transactionData.category_id,
        account_id: transactionData.account_id,
        status: transactionData.status,
      });

      const { data, error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: validated.description,
            amount: validated.amount,
            date: validated.date,
            type: validated.type,
            category_id: validated.category_id,
            account_id: validated.account_id,
            status: validated.status,
            invoice_month: transactionData.invoiceMonth || null,
            invoice_month_overridden: !!transactionData.invoiceMonth,
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);
    },
    onError: (error) => {
      logger.error('Error adding transaction:', error);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates, scope = 'current' }: {
      id: string;
      updates: Partial<Transaction>;
      scope?: 'current' | 'all';
    }) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate updates
      const partialSchema = editTransactionSchema.partial().required({ id: true });
      const validated = partialSchema.parse({
        id,
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString().split('T')[0] : undefined,
      });

      const { data, error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: validated.id,
          updates: validated,
          scope,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, scope = 'current' }: { id: string; scope?: 'current' | 'all' }) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate transaction ID
      const validated = z.object({
        id: z.string().uuid({ message: 'ID da transação inválido' }),
        scope: z.enum(['current', 'current-and-remaining', 'all']).optional(),
      }).parse({ id, scope });

      const { data, error } = await supabase.functions.invoke('atomic-delete-transaction', {
        body: { transaction_id: validated.id, scope: validated.scope || 'current' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);
    },
  });

  // Flatten all pages into single array
  const allTransactions = query.data?.pages.flatMap(page => page.transactions) || [];
  const totalCount = countQuery.data?.pages[0]?.count || 0;

  return {
    transactions: allTransactions,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
    totalCount,
    addTransaction: addMutation.mutateAsync,
    editTransaction: editMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
  };
}
