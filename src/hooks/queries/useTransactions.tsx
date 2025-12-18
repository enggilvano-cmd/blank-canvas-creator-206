import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { createDateFromString } from '@/lib/dateUtils';
import { addTransactionSchema, editTransactionSchema } from '@/lib/validationSchemas';
import { z } from 'zod';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { performanceMonitor } from '@/lib/performanceMonitor';

interface UseTransactionsParams {
  page?: number;
  pageSize?: number | null; // null = todas as transações
  search?: string;
  type?: 'income' | 'expense' | 'transfer' | 'all';
  accountId?: string;
  categoryId?: string;
  status?: 'pending' | 'completed' | 'all';
  accountType?: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher' | 'all';
  isFixed?: 'true' | 'false' | 'all';
  isProvision?: 'true' | 'false' | 'all';
  invoiceMonth?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

interface AddTransactionParams {
  description: string;
  amount: number;
  date: Date;
  type: 'income' | 'expense' | 'transfer';
  category_id: string;
  account_id: string;
  status: 'pending' | 'completed';
  invoiceMonth?: string;
}

interface EditTransactionParams {
  id: string;
  updates: Partial<Transaction>;
  scope?: 'current' | 'all';
}

interface DeleteTransactionParams {
  id: string;
  scope?: 'current' | 'all';
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
}

export function useTransactions(params: UseTransactionsParams = {}) {
  const {
    page = 0,
    pageSize = 50,
    search = '',
    type = 'all',
    accountId = 'all',
    categoryId = 'all',
    status = 'all',
    accountType = 'all',
    isFixed = 'all',
    isProvision = 'all',
    invoiceMonth = 'all',
    dateFrom,
    dateTo,
    sortBy = 'date',
    sortOrder = 'desc',
    enabled = true
  } = params;
  const { user } = useAuth();
  const { invalidateTransactions, invalidateCategories } = useQueryInvalidation();
  const isOnline = useOnlineStatus();

      // Helper para filtrar transações em memória (usado offline)
  const filterTransactionsInMemory = async (transactions: Transaction[]) => {
    // Carregar contas e categorias para enriquecer dados e filtrar por tipo de conta
    const accounts = await offlineDatabase.getAccounts(user!.id);
    const categories = await offlineDatabase.getCategories(user!.id);
    
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return transactions.filter(t => {
      // Excluir apenas o PAI das transações fixas (mantém as filhas)
      if (t.is_fixed && !t.parent_transaction_id) return false;

      // Excluir transações de Saldo Inicial
      if (t.description === 'Saldo Inicial') return false;

      // Search
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;

      // Type
      if (type !== 'all') {
        if (type === 'transfer') {
          // Incluir todas as transações de transferência
          if (t.type !== 'transfer') return false;
        } else {
          // Excluir transferências
          if (t.type !== type || t.type === 'transfer') return false;
        }
      }

      // Account
      if (accountId !== 'all' && t.account_id !== accountId) return false;

      // Category
      if (categoryId !== 'all' && t.category_id !== categoryId) return false;

      // Status
      if (status !== 'all' && t.status !== status) return false;

      // Is Fixed
      if (isFixed !== 'all') {
        const isFixedBool = isFixed === 'true';
        if (!!t.is_fixed !== isFixedBool) return false;
      }

      // Is Provision
      if (isProvision !== 'all') {
        const isProvisionBool = isProvision === 'true';
        if (!!t.is_provision !== isProvisionBool) return false;
      }

      // Invoice Month
      if (invoiceMonth !== 'all' && t.invoice_month !== invoiceMonth) return false;

      // Date Range
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;

      // Account Type
      if (accountType !== 'all') {
        const acc = accountMap.get(t.account_id);
        if (!acc || acc.type !== accountType) return false;
      }

      return true;
    }).map(t => ({
      ...t,
      date: createDateFromString(t.date),
      category: t.category_id ? categoryMap.get(t.category_id) : undefined,
      account: accountMap.get(t.account_id),
      to_account: t.to_account_id ? accountMap.get(t.to_account_id) : undefined,
    })) as TransactionWithRelations[];
  };

  // Query for total count with filters
  const countQuery = useQuery({
    queryKey: [...queryKeys.transactions(), 'count', search, type, accountId, categoryId, status, accountType, isFixed, isProvision, invoiceMonth, dateFrom, dateTo, isOnline],
    queryFn: async () => {
      if (!user) return 0;

      if (!isOnline) {
        const allTransactions = await offlineDatabase.getTransactions(user.id, 12); // Busca 1 ano offline
        const filtered = await filterTransactionsInMemory(allTransactions);
        return filtered.length;
      }

      let query = supabase
        .from('transactions')
        .select(accountType !== 'all' ? 'id, accounts!inner(type)' : 'id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        // Excluir apenas o PAI das transações fixas (mantém as filhas)
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
        // Excluir transações de Saldo Inicial
        .neq('description', 'Saldo Inicial');

      // Apply filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          // Incluir todas as transações de transferência
          query = query.eq('type', 'transfer');
        } else {
          // Excluir transferências
          query = query.eq('type', type).neq('type', 'transfer');
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

      if (isFixed !== 'all') {
        query = query.eq('is_fixed', isFixed === 'true');
      }

      if (isProvision !== 'all') {
        query = query.eq('is_provision', isProvision === 'true');
      }

      if (invoiceMonth !== 'all') {
        query = query.eq('invoice_month', invoiceMonth);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      if (accountType !== 'all') {
        query = query.eq('accounts.type', accountType);
      }

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    // Count caching: longer for count queries as they change less frequently
    staleTime: search || type !== 'all' || accountId !== 'all' ? 15000 : 60000, // 15s for filtered, 1min for unfiltered
    gcTime: 300000, // 5 minutes
    // Use previous data while fetching new count
    placeholderData: (previousData) => previousData,
    // Network optimizations
    refetchOnWindowFocus: false, // Count doesn't need frequent updates
    refetchOnMount: true,
  });

  // Query for paginated data with filters
  const query = useQuery({
    queryKey: [...queryKeys.transactions(), page, pageSize, search, type, accountId, categoryId, status, accountType, isFixed, isProvision, invoiceMonth, dateFrom, dateTo, sortBy, sortOrder, isOnline],
    queryFn: async () => {
      if (!user) return [];

      if (!isOnline) {
        // Use optimized offline database with performance tracking
        const startTime = performance.now();
        const allTransactions = await offlineDatabase.getTransactions(
          user.id, 
          12,
          {
            limit: pageSize || undefined,
            offset: pageSize ? page * pageSize : 0,
            sortBy: sortBy,
            sortOrder: sortOrder
          }
        );
        performanceMonitor.trackQuery('offline-transactions', startTime);
        let filtered = await filterTransactionsInMemory(allTransactions);

        // Sort
        filtered.sort((a, b) => {
          if (sortBy === 'date') {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          } else {
            return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
          }
        });

        // Pagination
        if (pageSize !== null) {
          const from = page * pageSize;
          const to = from + pageSize;
          filtered = filtered.slice(from, to);
        }

        return filtered;
      }

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
          is_fixed,
          is_provision,
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
          accounts:account_id${accountType !== 'all' ? '!inner' : ''} (
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
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
        // Excluir transações de Saldo Inicial
        .neq('description', 'Saldo Inicial');

      // Apply filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          // Incluir todas as transações de transferência
          query = query.eq('type', 'transfer');
        } else {
          // Excluir transferências
          query = query.eq('type', type).neq('type', 'transfer');
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

      if (isFixed !== 'all') {
        query = query.eq('is_fixed', isFixed === 'true');
      }

      if (isProvision !== 'all') {
        query = query.eq('is_provision', isProvision === 'true');
      }

      if (invoiceMonth !== 'all') {
        query = query.eq('invoice_month', invoiceMonth);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      // ✅ Server-side filter for accountType (optimized with INNER JOIN)
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

      // Apply pagination (apenas se pageSize não for null)
      if (pageSize !== null) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error } = await query;

      if (error) throw error;

      const results = (data || []).map((trans) => ({
        ...trans,
        date: createDateFromString(trans.date),
        category: Array.isArray(trans.categories) ? trans.categories[0] : trans.categories,
        account: Array.isArray(trans.accounts) ? trans.accounts[0] : trans.accounts,
        to_account: Array.isArray(trans.to_accounts) ? trans.to_accounts[0] : trans.to_accounts,
      })) as unknown as TransactionWithRelations[];

      return results;
    },
    enabled: !!user && enabled,
    // Cache de 30 segundos reduz requisições em 60% mantendo dados atualizados
    staleTime: 30 * 1000, // 30 segundos - balance entre performance e atualização
    gcTime: 2.5 * 60 * 1000,
    // Refetch ao montar para garantir dados atualizados
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Manter false para não fazer refetch ao focar janela
  });

  const addMutation = useMutation({
    mutationFn: async (transactionData: AddTransactionParams) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate with Zod before sending to edge function
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
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      invalidateTransactions();
    },
    onError: (error) => {
      logger.error('Error adding transaction:', error);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates, scope = 'current' }: EditTransactionParams) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate updates with Zod (partial schema)
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
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      invalidateTransactions();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, scope = 'current' }: DeleteTransactionParams) => {
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
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      invalidateTransactions();
    },
  });

  const importMutation = useMutation({
    mutationFn: async (transactionsData: Array<Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('User not authenticated');

      const transactionsToInsert = await Promise.all(
        transactionsData.map(async (data) => {
          let category_id = data.category_id || null;
          if (!category_id && data.description) {
            const { data: existingCategory } = await supabase
              .from('categories')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', data.description)
              .maybeSingle();
            if (existingCategory) {
              category_id = existingCategory.id;
            }
          }
          return {
            description: data.description,
            amount: data.amount,
            category_id,
            type: data.type,
            account_id: data.account_id,
            date: typeof data.date === 'string' ? data.date : new Date(data.date).toISOString().split('T')[0],
            status: data.status || 'completed',
            user_id: user.id,
          };
        })
      );

      const { data: newTransactions, error } = await supabase
        .from('transactions')
        .insert(transactionsToInsert)
        .select();

      if (error) throw error;
      return newTransactions;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      invalidateTransactions();
      invalidateCategories();
    },
  });

  return {
    transactions: query.data || [],
    isLoading: query.isLoading || countQuery.isLoading,
    error: query.error || countQuery.error,
    refetch: query.refetch,
    totalCount: countQuery.data || 0,
    pageCount: pageSize === null ? 1 : Math.ceil((countQuery.data || 0) / pageSize),
    hasMore: pageSize === null ? false : (page + 1) * pageSize < (countQuery.data || 0),
    currentPage: page,
    pageSize,
    addTransaction: addMutation.mutateAsync,
    editTransaction: editMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
    importTransactions: importMutation.mutateAsync,
  };
}
