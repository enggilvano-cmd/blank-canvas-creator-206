import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Account, DateFilterType, Transaction } from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '@/lib/logger';

export function useDashboardCalculations(
  accounts: Account[],
  dateFilter: DateFilterType,
  selectedMonth: Date,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined,
  transactionsKey?: string,  // Para monitorar mudanças nas transações
  allTransactions?: Transaction[],  // NOVO: Receber transações para calcular em memória
  fixedTransactions?: Transaction[] // NOVO: Receber transações fixas para projeção
) {
  
  console.log('🎯 useDashboardCalculations called with:', {
    accountsCount: accounts.length,
    dateFilter,
    transactionsKey,
    fixedTransactionsCount: fixedTransactions?.length
  });

  // Calcular date range baseado no filtro (memoizado para estabilidade)
  // IMPORTANTE: Deve vir ANTES de calculateTotalsFromTransactions
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
  
  // Função auxiliar para calcular totais baseado em transações em memória
  // Isso bypassa completamente a RPC que está quebrada
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

    console.log('💾 Calculating totals from memory (bypassing broken RPC):', {
      totalTransactions: allTransactions.length,
      dateRange,
    });

    // Filtrar transações baseado no período
    const isInPeriod = (transactionDate: string | Date) => {
      const txDate = typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate;
      if (dateRange.dateFrom && txDate < new Date(dateRange.dateFrom)) return false;
      if (dateRange.dateTo && txDate > new Date(dateRange.dateTo)) return false;
      return true;
    };

    // Filtros da RPC (replicar a lógica)
    const filteredTransactions = allTransactions.filter(t => {
      // Excluir transações de Saldo Inicial
      if (t.description === 'Saldo Inicial') return false;
      
      // Excluir se tem to_account_id (transferências pai)
      if (t.to_account_id) return false;
      
      // Excluir APENAS receitas espelho de transferências
      if (t.type === 'transfer' && t.linked_transaction_id) return false;
      
      // Filtrar por período
      if (!isInPeriod(t.date)) return false;
      
      return true;
    });

    // Identificar instâncias já geradas no período para não duplicar
    const instanceParentIds = new Set(
      filteredTransactions
        .filter(t => t.parent_transaction_id)
        .map(t => t.parent_transaction_id)
    );

    // Filtrar transações fixas que se aplicam ao período e ainda não foram geradas (projeção)
    const projectedFixedTransactions = (fixedTransactions || []).filter(ft => {
      // Se já tem instância gerada no período, ignorar o template
      if (instanceParentIds.has(ft.id)) return false;

      // Verificar se a data de início é anterior ou igual ao fim do período
      const ftDate = new Date(ft.date);
      if (dateRange.dateTo && ftDate > new Date(dateRange.dateTo)) return false;
      
      // Verificar se a transação fixa foi criada após o fim do período (não deve aparecer)
      // (Já coberto acima)

      // Verificar se é uma transferência (excluir se for pai de transferência, igual RPC)
      if (ft.to_account_id) return false;

      return true;
    });

    console.log('✅ Filtered transactions:', {
      totalFiltered: filteredTransactions.length,
      projectedFixed: projectedFixedTransactions.length,
      byType: {
        income: filteredTransactions.filter(t => t.type === 'income').length,
        expense: filteredTransactions.filter(t => t.type === 'expense').length,
      },
    });

    // Combinar transações reais e projetadas para os totais
    const allPeriodTransactions = [...filteredTransactions, ...projectedFixedTransactions];

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

    // Pendentes (inclui todas as projetadas fixas, pois ainda não aconteceram/foram geradas)
    const pendingExpTransactions = [
      ...filteredTransactions.filter(t => t.type === 'expense' && t.status === 'pending'),
      ...projectedFixedTransactions.filter(t => t.type === 'expense') // Fixas projetadas contam como pendentes
    ];
    const pendingIncTransactions = [
      ...filteredTransactions.filter(t => t.type === 'income' && t.status === 'pending'),
      ...projectedFixedTransactions.filter(t => t.type === 'income') // Fixas projetadas contam como pendentes
    ];

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
    // ✅ Usar cálculo em memória (bypassa RPC completamente)
    // Isso é mais confiável e responde imediatamente às mudanças
    const result = calculateTotalsFromTransactions();
    setAggregatedTotals(result);
    
    console.log('✅ Dashboard totals (from memory):', result);
  }, [calculateTotalsFromTransactions]);


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
