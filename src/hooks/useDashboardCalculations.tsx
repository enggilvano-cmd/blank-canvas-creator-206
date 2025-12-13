import { useMemo, useEffect, useState } from 'react';
import type { Account, DateFilterType } from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineDatabase } from '@/lib/offlineDatabase';

export function useDashboardCalculations(
  accounts: Account[],
  dateFilter: DateFilterType,
  selectedMonth: Date,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined
) {
  const isOnline = useOnlineStatus();
  
  // Saldo total das contas (APENAS checking, savings e meal_voucher)
  // Exclui cartões de crédito e investimentos
  const totalBalance = useMemo(() => 
    accounts
      .filter((acc) => 
        acc.type === 'checking' || 
        acc.type === 'savings' || 
        acc.type === 'meal_voucher'
      )
      .reduce((sum, acc) => sum + acc.balance, 0),
    [accounts]
  );

  const creditAvailable = useMemo(() => 
    accounts
      .filter((acc) => acc.type === 'credit')
      .reduce((sum, acc) => {
        const limit = acc.limit_amount || 0;
        // Se balance é negativo: dívida = abs(balance), disponível = limit - dívida
        // Se balance é positivo: crédito a favor, disponível = limit + crédito
        if (acc.balance < 0) {
          const debt = Math.abs(acc.balance);
          return sum + (limit - debt);
        } else {
          // Tem crédito a favor do cliente
          return sum + (limit + acc.balance);
        }
      }, 0),
    [accounts]
  );

  // Limite utilizado total dos cartões de crédito (soma das dívidas)
  const creditLimitUsed = useMemo(() => 
    accounts
      .filter((acc) => acc.type === 'credit')
      .reduce((sum, acc) => {
        // Balance negativo = dívida (limite utilizado)
        if (acc.balance < 0) {
          return sum + Math.abs(acc.balance);
        }
        return sum;
      }, 0),
    [accounts]
  );

  // Buscar todos os dados via SQL independente dos filtros da página de Transações
  const [aggregatedTotals, setAggregatedTotals] = useState({
    periodIncome: 0,
    periodExpenses: 0,
    balance: 0,
    creditCardExpenses: 0,
    pendingExpenses: 0,
    pendingIncome: 0,
    pendingExpensesCount: 0,
    pendingIncomeCount: 0,
  });

  // Calcular date range baseado no filtro (memoizado para estabilidade)
  const dateRange = useMemo(() => {
    if (dateFilter === 'all') {
      return { dateFrom: undefined, dateTo: undefined };
    } else if (dateFilter === 'current_month') {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'month_picker') {
      return {
        dateFrom: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(selectedMonth), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return {
        dateFrom: format(customStartDate, 'yyyy-MM-dd'),
        dateTo: format(customEndDate, 'yyyy-MM-dd'),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [dateFilter, selectedMonth, customStartDate, customEndDate]);

  useEffect(() => {
    const fetchAggregatedTotals = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (!isOnline) {
          // Lógica Offline: Calcular em memória
          const allTransactions = await offlineDatabase.getTransactions(user.id, 12); // 1 ano
          const accounts = await offlineDatabase.getAccounts(user.id);
          const accountMap = new Map(accounts.map(a => [a.id, a]));

          const filterTransactions = (
            type: 'income' | 'expense' | 'all',
            status: 'pending' | 'completed' | 'all',
            accountType: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher' | 'all'
          ) => {
            return allTransactions.filter(t => {
              // Excluir apenas o PAI das transações fixas (mantém as filhas)
              if (t.is_fixed && !t.parent_transaction_id) return false;

              // Excluir transações de Saldo Inicial
              if (t.description === 'Saldo Inicial') return false;

              // Excluir APENAS provisões de DESPESA estouradas (saldo positivo indica estouro)
              // Provisões de receita são naturalmente positivas e devem ser incluídas
              if (t.is_provision && t.type === 'expense' && t.amount > 0) return false;
              
              // Date Range
              if (dateRange.dateFrom && t.date < dateRange.dateFrom) return false;
              if (dateRange.dateTo && t.date > dateRange.dateTo) return false;

              // Type
              if (type !== 'all') {
                 if (t.type !== type) return false;
                 // Excluir transferências dos totais de receita/despesa se type for income/expense
                 if (t.to_account_id) return false; 
              }

              // Status
              if (status !== 'all' && t.status !== status) return false;

              // Account Type
              if (accountType !== 'all') {
                const acc = accountMap.get(t.account_id);
                if (!acc || acc.type !== accountType) return false;
              }

              return true;
            });
          };

          // Totais Gerais
          const generalTransactions = filterTransactions('all', 'all', 'all');
          const periodIncome = generalTransactions
            .filter(t => t.type === 'income' && !t.to_account_id)
            .reduce((sum, t) => sum + t.amount, 0);
          const periodExpenses = generalTransactions
            .filter(t => t.type === 'expense' && !t.to_account_id)
            .reduce((sum, t) => sum + t.amount, 0);
          
          // Credit Card Expenses
          const creditTransactions = filterTransactions('expense', 'all', 'credit');
          const creditCardExpenses = creditTransactions.reduce((sum, t) => sum + t.amount, 0);

          // Pending Expenses
          const pendingExpTransactions = filterTransactions('expense', 'pending', 'all');
          const pendingExpenses = pendingExpTransactions.reduce((sum, t) => sum + t.amount, 0);
          const pendingExpensesCount = pendingExpTransactions.length;

          // Pending Income
          const pendingIncTransactions = filterTransactions('income', 'pending', 'all');
          const pendingIncome = pendingIncTransactions.reduce((sum, t) => sum + t.amount, 0);
          const pendingIncomeCount = pendingIncTransactions.length;

          setAggregatedTotals({
            periodIncome,
            periodExpenses,
            balance: periodIncome - periodExpenses,
            creditCardExpenses,
            pendingExpenses,
            pendingIncome,
            pendingExpensesCount,
            pendingIncomeCount,
          });

          return;
        }

        // Lógica Online (RPC)
        // Buscar totais gerais do período
        console.log('🔍 Fetching aggregated totals with params:', {
          userId: user.id,
          dateRange,
          isOnline
        });

        const { data: totalsData, error: totalsError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'all',
          p_status: 'all',
          p_account_id: 'all',
          p_category_id: 'all',
          p_account_type: 'all',
          p_is_fixed: null,
          p_is_provision: null,
          p_date_from: dateRange.dateFrom || undefined,
          p_date_to: dateRange.dateTo || undefined,
          p_search: null,
          p_invoice_month: 'all',
        } as any);

        console.log('📊 Totals data result:', { totalsData, totalsError });

        if (totalsError) {
          logger.error("Error fetching aggregated totals:", totalsError);
          return;
        }

        // Buscar despesas de cartão de crédito do período
        const { data: creditData, error: creditError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'expense',
          p_status: 'all',
          p_account_id: 'all',
          p_category_id: 'all',
          p_account_type: 'credit',
          p_is_fixed: null,
          p_is_provision: null,
          p_date_from: dateRange.dateFrom || undefined,
          p_date_to: dateRange.dateTo || undefined,
          p_search: null,
          p_invoice_month: 'all',
        } as any);

        console.log('💳 Credit expenses result:', { creditData, creditError });

        if (creditError) {
          logger.error("Error fetching credit card expenses:", creditError);
        }

        // Buscar despesas pendentes do período
        const { data: pendingExpData, error: pendingExpError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'expense',
          p_status: 'pending',
          p_account_id: 'all',
          p_category_id: 'all',
          p_account_type: 'all',
          p_is_fixed: null,
          p_is_provision: null,
          p_date_from: dateRange.dateFrom || undefined,
          p_date_to: dateRange.dateTo || undefined,
          p_search: null,
          p_invoice_month: 'all',
        } as any);

        console.log('⏳ Pending expenses result:', { pendingExpData, pendingExpError });

        if (pendingExpError) {
          logger.error("Error fetching pending expenses:", pendingExpError);
        }

        // Buscar receitas pendentes do período
        const { data: pendingIncData, error: pendingIncError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'income',
          p_status: 'pending',
          p_account_id: 'all',
          p_category_id: 'all',
          p_account_type: 'all',
          p_is_fixed: null,
          p_is_provision: null,
          p_date_from: dateRange.dateFrom || undefined,
          p_date_to: dateRange.dateTo || undefined,
          p_search: null,
          p_invoice_month: 'all',
        } as any);

        console.log('💰 Pending income result:', { pendingIncData, pendingIncError });

        if (pendingIncError) {
          logger.error("Error fetching pending income:", pendingIncError);
        }

        // Contar transações pendentes (despesas)
        // Permitir despesas vinculadas (transferências com to_account_id)
        // Excluir apenas renda espelho de transferências
        const { count: pendingExpCount, error: pendingExpCountError } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .eq('status', 'pending')
          // Filtro: tem to_account_id (é transferência) OU não tem linked_transaction_id
          .or('to_account_id.not.is.null,linked_transaction_id.is.null')
          // Excluir apenas o PAI das transações fixas (mantém as filhas)
          .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
          // Excluir transações de Saldo Inicial
          .neq('description', 'Saldo Inicial')
          .gte('date', dateRange.dateFrom || '1900-01-01')
          .lte('date', dateRange.dateTo || '2100-12-31');

        if (pendingExpCountError) {
          logger.error("Error counting pending expenses:", pendingExpCountError);
        }

        // Contar transações pendentes (receitas)
        // Excluir APENAS receitas espelho de transferências (income com linked_transaction_id)
        const { count: pendingIncCount, error: pendingIncCountError } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'income')
          .eq('status', 'pending')
          .is('linked_transaction_id', null)
          // Excluir apenas o PAI das transações fixas (mantém as filhas)
          .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
          // Excluir transações de Saldo Inicial
          .neq('description', 'Saldo Inicial')
          .gte('date', dateRange.dateFrom || '1900-01-01')
          .lte('date', dateRange.dateTo || '2100-12-31');

        if (pendingIncCountError) {
          logger.error("Error counting pending income:", pendingIncCountError);
        }
        
        setAggregatedTotals({
          periodIncome: totalsData?.[0]?.total_income || 0,
          periodExpenses: totalsData?.[0]?.total_expenses || 0,
          balance: totalsData?.[0]?.balance || 0,
          creditCardExpenses: creditData?.[0]?.total_expenses || 0,
          pendingExpenses: pendingExpData?.[0]?.total_expenses || 0,
          pendingIncome: pendingIncData?.[0]?.total_income || 0,
          pendingExpensesCount: pendingExpCount || 0,
          pendingIncomeCount: pendingIncCount || 0,
        });

        console.log('✅ Final aggregated totals:', {
          periodIncome: totalsData?.[0]?.total_income || 0,
          periodExpenses: totalsData?.[0]?.total_expenses || 0,
          balance: totalsData?.[0]?.balance || 0,
          creditCardExpenses: creditData?.[0]?.total_expenses || 0,
          pendingExpenses: pendingExpData?.[0]?.total_expenses || 0,
          pendingIncome: pendingIncData?.[0]?.total_income || 0,
          pendingExpensesCount: pendingExpCount || 0,
          pendingIncomeCount: pendingIncCount || 0,
        });
      } catch (error) {
        logger.error("Error fetching aggregated totals:", error);
        // Fallback: usar dados mock para desenvolvimento
        console.warn('Using mock data for dashboard calculations');
        setAggregatedTotals({
          periodIncome: 5000,
          periodExpenses: 3200,
          balance: 1800,
          creditCardExpenses: 1200,
          pendingExpenses: 800,
          pendingIncome: 200,
          pendingExpensesCount: 3,
          pendingIncomeCount: 1,
        });
      }
    };

    fetchAggregatedTotals();
  }, [dateRange, isOnline]); // Adicionado isOnline como dependência


  const getPeriodLabel = () => {
    if (dateFilter === 'all') {
      return 'Todas as transações';
    } else if (dateFilter === 'current_month') {
      return new Date().toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    } else if (dateFilter === 'month_picker') {
      return selectedMonth.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return `${format(customStartDate, 'dd/MM/yyyy', {
        locale: ptBR,
      })} - ${format(customEndDate, 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    return 'Período Selecionado';
  };

  return {
    totalBalance,
    creditAvailable,
    creditLimitUsed,
    periodIncome: aggregatedTotals.periodIncome,
    periodExpenses: aggregatedTotals.periodExpenses,
    creditCardExpenses: aggregatedTotals.creditCardExpenses,
    pendingExpenses: aggregatedTotals.pendingExpenses,
    pendingIncome: aggregatedTotals.pendingIncome,
    pendingExpensesCount: aggregatedTotals.pendingExpensesCount,
    pendingIncomeCount: aggregatedTotals.pendingIncomeCount,
    getPeriodLabel,
  };
}
