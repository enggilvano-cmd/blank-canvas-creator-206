import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Account, DateFilterType, Transaction } from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardCalculations(
  accounts: Account[],
  dateRange: { dateFrom?: string; dateTo?: string }, // ✅ RECEBE dateRange ao invés de calcular
  transactionsKey?: string,  // Para monitorar mudanças nas transações
  allTransactions?: Transaction[],  // NOVO: Receber transações para calcular em memória
  fixedTransactions?: Transaction[], // NOVO: Receber transações fixas para projeção
  dateFilter?: DateFilterType, // ✅ Apenas para getPeriodLabel
  selectedMonth?: Date, // ✅ Apenas para getPeriodLabel
  customStartDate?: Date, // ✅ Apenas para getPeriodLabel
  customEndDate?: Date // ✅ Apenas para getPeriodLabel
) {
  
  console.log('🎯 useDashboardCalculations called with:', {
    accountsCount: accounts.length,
    dateRange,
    transactionsKey,
    fixedTransactionsCount: fixedTransactions?.length
  });
  
  // Função auxiliar para calcular totais baseado em transações em memória
  // Usada como FALLBACK se a RPC falhar (ex: offline)
  const calculateTotalsFromTransactions = useCallback(() => {
    if (!allTransactions) {
      return {
        periodIncome: 0,
        periodExpenses: 0,
        balance: 0,
        creditCardExpenses: 0,
        pendingExpenses: 0,
        pendingIncome: 0,
        pendingExpensesCount: 0,
        pendingIncomeCount: 0,
      };
    }

    console.log('💾 Calculating totals from memory (fallback):', {
      totalTransactions: allTransactions.length,
      dateRange,
    });

    // ✅ BUG FIX #2: Comparar datas como strings YYYY-MM-DD para evitar problemas de fuso horário
    const isInPeriod = (transactionDate: string | Date) => {
      // Converter para string YYYY-MM-DD se for Date
      const txDateStr = typeof transactionDate === 'string' 
        ? transactionDate 
        : transactionDate.toISOString().split('T')[0];
      
      if (dateRange.dateFrom && txDateStr < dateRange.dateFrom) {
        return false;
      }
      
      if (dateRange.dateTo && txDateStr > dateRange.dateTo) {
        return false;
      }
      
      return true;
    };

    // Filtros da RPC (replicar a lógica)
    const filteredTransactions = allTransactions.filter(t => {
      // Excluir transações de Saldo Inicial
      if (t.description === 'Saldo Inicial') return false;
      
      // Excluir transferências (RPC exclui type='transfer' sempre)
      if (t.type === 'transfer') return false;
      if (t.to_account_id) return false;
      if (t.type === 'income' && t.linked_transaction_id) return false;

      // EXCLUIR apenas o PAI de transações fixas (templates)
      // Se for fixa (is_fixed=true) e NÃO tiver parent_transaction_id, é um template
      if (t.is_fixed && !t.parent_transaction_id) return false;

      // EXCLUIR provisões positivas (overspent)
      if (t.is_provision && t.amount > 0) return false;
      
      // Filtrar por período
      if (!isInPeriod(t.date)) return false;
      
      return true;
    });

    // Combinar transações reais (sem projeções para bater com a página de transações)
    const allPeriodTransactions = [...filteredTransactions];

    // Calcular totais gerais
    const incomeTransactions = allPeriodTransactions.filter(t => t.type === 'income');
    const expenseTransactions = allPeriodTransactions.filter(t => t.type === 'expense');
    const creditTransactions = allPeriodTransactions.filter(t => {
      const account = accounts.find(a => a.id === t.account_id);
      return t.type === 'expense' && account?.type === 'credit';
    });

    // t.amount vem em REAIS do banco, converter para CENTAVOS para formatCurrency
    const periodIncome = incomeTransactions.reduce((sum, t) => sum + (t.amount * 100), 0);
    const periodExpenses = expenseTransactions.reduce((sum, t) => sum + (Math.abs(t.amount) * 100), 0);
    const creditCardExpenses = creditTransactions.reduce((sum, t) => sum + (Math.abs(t.amount) * 100), 0);

    // Pendentes (apenas as que existem no banco)
    const pendingExpTransactions = filteredTransactions.filter(t => t.type === 'expense' && t.status === 'pending');
    const pendingIncTransactions = filteredTransactions.filter(t => t.type === 'income' && t.status === 'pending');

    const pendingExpenses = pendingExpTransactions.reduce((sum, t) => sum + (Math.abs(t.amount) * 100), 0);
    const pendingIncome = pendingIncTransactions.reduce((sum, t) => sum + (t.amount * 100), 0);

    return {
      periodIncome,
      periodExpenses,
      balance: periodIncome - periodExpenses,
      creditCardExpenses,
      pendingExpenses,
      pendingIncome,
      pendingExpensesCount: pendingExpTransactions.length,
      pendingIncomeCount: pendingIncTransactions.length,
    };
  }, [allTransactions, fixedTransactions, dateRange, accounts]);
  // acc.balance vem em REAIS do banco, converter para CENTAVOS para formatCurrency
  const totalBalance = useMemo(() => 
    accounts
      .filter((acc) => 
        !acc.ignored &&
        (acc.type === 'checking' || 
        acc.type === 'savings' || 
        acc.type === 'investment' ||
        acc.type === 'meal_voucher')
      )
      .reduce((sum, acc) => sum + (acc.balance * 100), 0),
    [accounts]
  );

  // acc.balance vem em REAIS, mas acc.limit_amount vem em CENTAVOS do banco
  const creditAvailable = useMemo(() => 
    accounts
      .filter((acc) => !acc.ignored && acc.type === 'credit')
      .reduce((sum, acc) => {
        const limit = acc.limit_amount || 0; // Já está em CENTAVOS
        const balance = acc.balance; // Está em REAIS
        
        // Converter balance para centavos para fazer a conta
        const balanceInCents = balance * 100;

        // Se balance é negativo: dívida = abs(balance), disponível = limit - dívida
        // Se balance é positivo: crédito a favor, disponível = limit + crédito
        let available = 0;
        if (balanceInCents < 0) {
          const debt = Math.abs(balanceInCents);
          available = limit - debt;
        } else {
          // Tem crédito a favor do cliente
          available = limit + balanceInCents;
        }
        return sum + available; // Já está em centavos
      }, 0),
    [accounts]
  );

  // Limite utilizado total dos cartões de crédito (soma das dívidas)
  // acc.balance vem em REAIS, converter para CENTAVOS
  const creditLimitUsed = useMemo(() => 
    accounts
      .filter((acc) => !acc.ignored && acc.type === 'credit')
      .reduce((sum, acc) => {
        // Balance negativo = dívida (limite utilizado)
        if (acc.balance < 0) {
          return sum + (Math.abs(acc.balance) * 100); // Converter para centavos
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

  useEffect(() => {
    const fetchTotals = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Tentar buscar via RPC primeiro (mais rápido e leve)
        const { data, error } = await supabase.rpc('get_dashboard_metrics', {
          p_user_id: user.id,
          p_date_from: dateRange.dateFrom || null,
          p_date_to: dateRange.dateTo || null
        });

        if (error) throw error;

        if (data && data.length > 0) {
          console.log('✅ Dashboard totals (from RPC):', data[0]);
          setAggregatedTotals({
            periodIncome: Number(data[0].period_income) * 100, // Converter para centavos
            periodExpenses: Number(data[0].period_expenses) * 100,
            balance: Number(data[0].balance) * 100,
            creditCardExpenses: Number(data[0].credit_card_expenses) * 100,
            pendingExpenses: Number(data[0].pending_expenses) * 100,
            pendingIncome: Number(data[0].pending_income) * 100,
            pendingExpensesCount: Number(data[0].pending_expenses_count),
            pendingIncomeCount: Number(data[0].pending_income_count),
          });
        }
      } catch (error) {
        logger.error('Error fetching dashboard metrics via RPC, falling back to memory:', error);
        
        // Fallback: Usar cálculo em memória se RPC falhar
        const result = calculateTotalsFromTransactions();
        setAggregatedTotals(result);
      }
    };

    fetchTotals();
  }, [dateRange, transactionsKey, calculateTotalsFromTransactions]);


  const getPeriodLabel = () => {
    if (!dateFilter || dateFilter === 'all') {
      return 'Todas as transações';
    } else if (dateFilter === 'current_month') {
      return new Date().toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    } else if (dateFilter === 'month_picker' && selectedMonth) {
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
