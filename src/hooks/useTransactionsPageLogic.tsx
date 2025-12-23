import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { Transaction, Account, Category } from "@/types";
import { EditScope } from "@/components/TransactionScopeDialog";

interface UseTransactionsPageLogicProps {
  transactions: Transaction[];
  allTransactions?: Transaction[]; // ✅ NOVO: Para cálculo correto de totais no fallback
  accounts: Account[];
  categories: Category[];
  filterType: "all" | "income" | "expense" | "transfer";
  onFilterTypeChange: (type: "all" | "income" | "expense" | "transfer") => void;
  filterStatus: "all" | "pending" | "completed";
  onFilterStatusChange: (status: "all" | "pending" | "completed") => void;
  filterIsFixed: string;
  onFilterIsFixedChange: (value: string) => void;
  filterIsProvision: string;
  onFilterIsProvisionChange: (value: string) => void;
  filterAccountType: string;
  onFilterAccountTypeChange: (type: string) => void;
  filterAccount: string;
  onFilterAccountChange: (accountId: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (categoryId: string) => void;
  filterInvoiceMonth: string;
  onFilterInvoiceMonthChange: (month: string) => void;
  periodFilter: "all" | "current_month" | "month_picker" | "custom";
  onPeriodFilterChange: (value: "all" | "current_month" | "month_picker" | "custom") => void;
  selectedMonth: Date;
  onSelectedMonthChange: (date: Date) => void;
  customStartDate: Date | undefined;
  customEndDate: Date | undefined;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: (date: string | undefined) => void;
  onDateToChange: (date: string | undefined) => void;
  search: string;
  onDeleteTransaction: (transactionId: string, scope?: EditScope) => void;
}

export function useTransactionsPageLogic({
  transactions,
  allTransactions, // ✅ NOVO: Todas as transações sem paginação
  accounts,
  categories,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  filterIsFixed,
  onFilterIsFixedChange,
  filterIsProvision,
  onFilterIsProvisionChange,
  filterAccountType,
  onFilterAccountTypeChange,
  filterAccount,
  onFilterAccountChange,
  filterCategory,
  onFilterCategoryChange,
  filterInvoiceMonth,
  onFilterInvoiceMonthChange,
  periodFilter,
  onPeriodFilterChange,
  selectedMonth,
  onSelectedMonthChange,
  customStartDate,
  customEndDate,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  search,
  onDeleteTransaction,
}: UseTransactionsPageLogicProps) {
  const { toast } = useToast();
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteTransaction, setPendingDeleteTransaction] = useState<Transaction | null>(null);
  const [pendingTransactionsCount, setPendingTransactionsCount] = useState(0);
  const [hasCompletedTransactions, setHasCompletedTransactions] = useState(false);

  // Aggregated totals from server
  const [aggregatedTotals, setAggregatedTotals] = useState({ income: 0, expenses: 0, balance: 0 });

  // Filter accounts by type
  const accountsByType = useMemo(() => {
    if (filterAccountType === "all") {
      return accounts;
    }
    return accounts.filter((account) => account.type === filterAccountType);
  }, [accounts, filterAccountType]);

  // ✅ CENTRALIZADO: Função para atualizar dateRange (evita duplicação)
  const updateDateRange = (startDate: Date, endDate: Date) => {
    onDateFromChange(format(startDate, 'yyyy-MM-dd'));
    onDateToChange(format(endDate, 'yyyy-MM-dd'));
  };

  // Handle date filter changes
  const handleDateFilterChange = (value: "all" | "current_month" | "month_picker" | "custom") => {
    onPeriodFilterChange(value);
    
    if (value === "current_month") {
      const now = new Date();
      updateDateRange(startOfMonth(now), endOfMonth(now)); // ✅ Usa função centralizada
    } else if (value === "all") {
      onDateFromChange(undefined);
      onDateToChange(undefined);
    }
  };

  const handleMonthChange = (newMonth: Date) => {
    onSelectedMonthChange(newMonth);
    updateDateRange(startOfMonth(newMonth), endOfMonth(newMonth)); // ✅ Usa função centralizada
  };

  // Update date range when custom dates change
  useEffect(() => {
    if (periodFilter === "custom" && customStartDate && customEndDate) {
      updateDateRange(customStartDate, customEndDate); // ✅ Usa função centralizada
    }
  }, [customStartDate, customEndDate, periodFilter]);

  // Generate filter chips
  const filterChips = useMemo(() => {
    const chips = [];

    if (filterType !== "all") {
      const typeLabels = {
        income: "Receita",
        expense: "Despesa",
        transfer: "Transferência",
      };
      chips.push({
        id: "type",
        label: typeLabels[filterType as keyof typeof typeLabels],
        value: filterType,
        onRemove: () => onFilterTypeChange("all"),
      });
    }

    if (filterStatus !== "all") {
      const statusLabels = {
        completed: "Concluído",
        pending: "Pendente",
      };
      chips.push({
        id: "status",
        label: statusLabels[filterStatus as keyof typeof statusLabels],
        value: filterStatus,
        onRemove: () => onFilterStatusChange("all"),
      });
    }

    if (filterIsFixed !== "all") {
      chips.push({
        id: "isFixed",
        label: filterIsFixed === "true" ? "Fixa" : "Não Fixa",
        value: filterIsFixed,
        onRemove: () => onFilterIsFixedChange("all"),
      });
    }

    if (filterIsProvision !== "all") {
      chips.push({
        id: "isProvision",
        label: filterIsProvision === "true" ? "Provisão" : "Não Provisão",
        value: filterIsProvision,
        onRemove: () => onFilterIsProvisionChange("all"),
      });
    }

    if (filterAccountType !== "all") {
      const accountTypeLabels = {
        checking: "Conta Corrente",
        credit: "Cartão de Crédito",
        investment: "Investimento",
        savings: "Poupança",
        meal_voucher: "Vale Refeição/Alimentação",
      };
      chips.push({
        id: "accountType",
        label: accountTypeLabels[filterAccountType as keyof typeof accountTypeLabels],
        value: filterAccountType,
        onRemove: () => onFilterAccountTypeChange("all"),
      });
    }

    if (filterAccount !== "all") {
      const account = accounts.find((a) => a.id === filterAccount);
      if (account) {
        chips.push({
          id: "account",
          label: account.name,
          value: filterAccount,
          color: account.color,
          onRemove: () => onFilterAccountChange("all"),
        });
      }
    }

    if (filterCategory !== "all") {
      const category = categories.find((c) => c.id === filterCategory);
      if (category) {
        chips.push({
          id: "category",
          label: category.name,
          value: filterCategory,
          color: category.color,
          onRemove: () => onFilterCategoryChange("all"),
        });
      }
    }

    if (filterInvoiceMonth !== "all") {
      chips.push({
        id: "invoiceMonth",
        label: `Fatura: ${filterInvoiceMonth}`,
        value: filterInvoiceMonth,
        onRemove: () => onFilterInvoiceMonthChange("all"),
      });
    }

    if (periodFilter !== "all") {
      let periodLabel = "";
      if (periodFilter === "current_month") {
        periodLabel = "Mês Atual";
      } else if (periodFilter === "month_picker") {
        periodLabel = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });
      } else if (periodFilter === "custom" && customStartDate && customEndDate) {
        periodLabel = `${format(customStartDate, "dd/MM/yyyy")} - ${format(customEndDate, "dd/MM/yyyy")}`;
      }
      
      if (periodLabel) {
        const chip: any = {
          id: "period",
          label: periodLabel,
          value: periodFilter,
          onRemove: () => handleDateFilterChange("all"),
        };

        if (periodFilter === "month_picker") {
          chip.onPrevious = () => handleMonthChange(subMonths(selectedMonth, 1));
          chip.onNext = () => handleMonthChange(addMonths(selectedMonth, 1));
        }

        chips.push(chip);
      }
    }

    return chips;
  }, [
    filterType,
    filterStatus,
    filterIsFixed,
    filterIsProvision,
    filterAccountType,
    filterAccount,
    filterCategory,
    filterInvoiceMonth,
    periodFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    accounts,
    categories,
    // ✅ REMOVIDO: Funções onChange são estáveis (não precisam estar aqui)
    // onFilterTypeChange, onFilterStatusChange, etc.
  ]);

  const clearAllFilters = () => {
    onFilterTypeChange("all");
    onFilterStatusChange("all");
    onFilterIsFixedChange("all");
    onFilterIsProvisionChange("all");
    onFilterAccountTypeChange("all");
    onFilterAccountChange("all");
    onFilterCategoryChange("all");
    onFilterInvoiceMonthChange("all");
    handleDateFilterChange("all");
  };

  // Fetch aggregated totals
  useEffect(() => {
    const fetchAggregatedTotals = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const params: Record<string, unknown> = {
          p_user_id: user.id,
          p_type: filterType === 'all' ? 'all' : filterType, // ✅ CORRIGIDO: Passar 'all' ao invés de null
          p_status: filterStatus === 'all' ? 'all' : filterStatus, // ✅ CORRIGIDO
          p_account_id: filterAccount === 'all' ? 'all' : filterAccount, // ✅ CORRIGIDO
          p_category_id: filterCategory === 'all' ? 'all' : filterCategory, // ✅ CORRIGIDO
          p_account_type: filterAccountType === 'all' ? 'all' : filterAccountType, // ✅ CORRIGIDO
          p_is_fixed: filterIsFixed !== 'all' ? filterIsFixed === 'true' : null,
          p_is_provision: filterIsProvision !== 'all' ? filterIsProvision === 'true' : null,
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
          p_search: search || null,
          p_invoice_month: filterInvoiceMonth === 'all' ? 'all' : filterInvoiceMonth, // ✅ CORRIGIDO
        };

        logger.info("Fetching aggregated totals with params:", params);

        const { data, error } = await supabase.rpc('get_transactions_totals', params);

        if (error) {
          logger.error("RPC Error fetching aggregated totals:", error);
          throw error;
        }
        
        if (data && data.length > 0) {
          logger.info("Aggregated totals received:", data[0]);
          setAggregatedTotals({
            income: data[0].total_income,
            expenses: data[0].total_expenses,
            balance: data[0].balance,
          });
        } else {
          logger.warn("No data returned from get_transactions_totals");
        }
      } catch (error) {
        logger.error("Error fetching aggregated totals:", error);
        
        // ⚠️ FALLBACK: Cálculo local quando RPC falha
        // IMPORTANTE: Usa allTransactions (não paginadas) para totais corretos
        const sourceTransactions = allTransactions || transactions;
        
        if (!allTransactions) {
          logger.warn('⚠️ Usando transactions paginadas para calcular totais. Resultado pode estar incorreto.');
        }
        
        // Função para identificar transferências e outros itens a excluir (excluir dos totais)
        const shouldExclude = (t: typeof sourceTransactions[number]) => {
          // 1. Transferências
          if (t.type === 'transfer') return true;
          if ((t as any).to_account_id) return true;
          if (t.type === 'income' && (t as any).linked_transaction_id) return true; // Receita espelho
          
          // 2. Saldo Inicial
          if (t.description === 'Saldo Inicial') return true;

          // 3. Provisões positivas (overspent)
          if (t.is_provision && t.amount > 0) return true;

          // 4. Pai de transações fixas (templates)
          // Se é fixa e não tem parent_id, é o template (pai). Se tem parent_id, é a instância (filha).
          // O RPC exclui: (t.parent_transaction_id IS NOT NULL OR t.is_fixed IS NOT TRUE OR t.is_fixed IS NULL)
          // Ou seja, mantem se: tem pai OU não é fixa.
          // Logo, EXCLUI se: não tem pai E é fixa.
          if (t.is_fixed && !t.parent_transaction_id) return true;

          return false;
        };

        // Aplicar filtros localmente para garantir que o fallback respeite os filtros selecionados
        let filtered = sourceTransactions.filter(t => !shouldExclude(t));

        if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType);
        if (filterStatus !== 'all') filtered = filtered.filter(t => t.status === filterStatus);
        if (filterAccount !== 'all') filtered = filtered.filter(t => t.account_id === filterAccount);
        if (filterCategory !== 'all') filtered = filtered.filter(t => t.category_id === filterCategory);
        if (filterAccountType !== 'all') {
          filtered = filtered.filter(t => {
            const account = accounts.find(a => a.id === t.account_id);
            return account?.type === filterAccountType;
          });
        }
        // Conversão segura para string para comparação com filtros
        if (filterIsFixed !== 'all') filtered = filtered.filter(t => String(!!t.is_fixed) === filterIsFixed);
        if (filterIsProvision !== 'all') filtered = filtered.filter(t => String(!!t.is_provision) === filterIsProvision);
        if (filterInvoiceMonth !== 'all') filtered = filtered.filter(t => t.invoice_month === filterInvoiceMonth);
        
        if (dateFrom) {
          // Ajuste de fuso horário pode ser necessário dependendo de como dateFrom vem
          // Mas assumindo YYYY-MM-DD string simples:
          const from = new Date(dateFrom + 'T00:00:00');
          filtered = filtered.filter(t => new Date(t.date) >= from);
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59');
          filtered = filtered.filter(t => new Date(t.date) <= to);
        }
        
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = filtered.filter(t => t.description.toLowerCase().includes(searchLower));
        }

        const localIncome = filtered
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0);
        const localExpenses = filtered
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        setAggregatedTotals({
          income: localIncome,
          expenses: localExpenses,
          balance: localIncome - localExpenses,
        });
        
        logger.info('Using local calculation for totals (with filters):', { localIncome, localExpenses });
      }
    };

    fetchAggregatedTotals();
  }, [
    filterType,
    filterStatus,
    filterAccount,
    filterCategory,
    filterAccountType,
    filterIsFixed,
    filterIsProvision,
    filterInvoiceMonth,
    dateFrom,
    dateTo,
    search,
    transactions.length, // Adiciona para forçar atualização após exclusões
  ]);

  // Export to Excel
  const exportToExcel = async () => {
    try {
      const { exportTransactionsToExcel } = await import('@/lib/exportUtils');
      // Converter transactions para formato compatível com ExportTransaction
      const exportData = transactions.map(t => ({
        ...t,
        date: typeof t.date === 'string' ? t.date : t.date.toISOString(),
      })) as Array<{ id: string; description: string; amount: number; date: string; type: 'income' | 'expense' | 'transfer'; status: 'pending' | 'completed'; account_id: string; category_id?: string | null; to_account_id?: string | null; installments?: number | null; current_installment?: number | null; invoice_month?: string | null; is_recurring?: boolean | null; is_fixed?: boolean | null; created_at?: string }>;
      await exportTransactionsToExcel(exportData, accounts, categories);
      
      toast({
        title: "Sucesso",
        description: `${transactions.length} transação${transactions.length !== 1 ? 'ões' : ''} exportada${transactions.length !== 1 ? 's' : ''} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar transações",
        variant: "destructive",
      });
    }
  };

  // Handle delete with scope
  const handleDeleteWithScope = async (transactionId: string, scope?: EditScope) => {
    const transaction = transactions.find(t => t.id === transactionId);
    
    if (!scope && transaction) {
      const isInstallment = Boolean(transaction.installments && transaction.installments > 1);
      const isRecurring = Boolean(transaction.is_recurring || transaction.is_fixed);
      const hasParent = Boolean(transaction.parent_transaction_id);
      
      if (isInstallment || isRecurring || hasParent) {
        try {
          const parentId = transaction.parent_transaction_id || transaction.id;
          const { data: childTransactions } = await supabase
            .from("transactions")
            .select("id, status, date")
            .eq("parent_transaction_id", parentId);

          // Filtrar apenas transações pendentes que são futuras ou iguais à atual
          // Isso garante que a contagem reflita o que será afetado pela opção "Esta e Próximas"
          const currentTransactionDate = new Date(transaction.date);
          
          const pendingCount = childTransactions?.filter(t => {
            if (t.status !== "pending") return false;
            const tDate = new Date(t.date);
            // Considera pendentes da mesma data ou futuras
            return tDate >= currentTransactionDate;
          }).length || 0;

          const hasCompleted = childTransactions?.some(t => t.status === "completed") || false;

          setPendingTransactionsCount(pendingCount);
          setHasCompletedTransactions(hasCompleted);
        } catch (error) {
          logger.error("Error fetching child transactions:", error);
          setPendingTransactionsCount(0);
          setHasCompletedTransactions(false);
        }
        
        setPendingDeleteTransaction(transaction);
        setScopeDialogOpen(true);
        return;
      }
      
      // Transação simples - abrir diálogo de confirmação
      setPendingDeleteTransaction(transaction);
      setDeleteDialogOpen(true);
      return;
    }
    
    onDeleteTransaction(transactionId, scope);
  };

  const confirmDelete = () => {
    if (pendingDeleteTransaction) {
      onDeleteTransaction(pendingDeleteTransaction.id);
      setDeleteDialogOpen(false);
      setPendingDeleteTransaction(null);
    }
  };

  return {
    accountsByType,
    handleDateFilterChange,
    handleMonthChange,
    filterChips,
    clearAllFilters,
    aggregatedTotals,
    exportToExcel,
    handleDeleteWithScope,
    confirmDelete,
    scopeDialogOpen,
    setScopeDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    pendingDeleteTransaction,
    setPendingDeleteTransaction,
    pendingTransactionsCount,
    hasCompletedTransactions,
  };
}
