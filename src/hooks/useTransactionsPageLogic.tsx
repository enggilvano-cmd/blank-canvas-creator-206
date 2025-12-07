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
  filterInvoiceMonth: string;
  onFilterInvoiceMonthChange: (value: string) => void;
  filterAccountType: string;
  onFilterAccountTypeChange: (type: string) => void;
  filterAccount: string;
  onFilterAccountChange: (accountId: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (categoryId: string) => void;
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
  filterInvoiceMonth,
  onFilterInvoiceMonthChange,
  filterAccountType,
  onFilterAccountTypeChange,
  filterAccount,
  onFilterAccountChange,
  filterCategory,
  onFilterCategoryChange,
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

  // Handle date filter changes
  const handleDateFilterChange = (value: "all" | "current_month" | "month_picker" | "custom") => {
    onPeriodFilterChange(value);
    
    if (value === "current_month") {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      onDateFromChange(format(start, 'yyyy-MM-dd'));
      onDateToChange(format(end, 'yyyy-MM-dd'));
    } else if (value === "all") {
      onDateFromChange(undefined);
      onDateToChange(undefined);
    }
  };

  const handleMonthChange = (newMonth: Date) => {
    onSelectedMonthChange(newMonth);
    const start = startOfMonth(newMonth);
    const end = endOfMonth(newMonth);
    onDateFromChange(format(start, 'yyyy-MM-dd'));
    onDateToChange(format(end, 'yyyy-MM-dd'));
  };

  // ✅ BUGFIX: Sincronizar dateFrom/dateTo com periodFilter na inicialização
  // Isso garante que quando o filtro de período é "all", os filtros de data são removidos
  useEffect(() => {
    if (periodFilter === "all") {
      // Se período é "all", garantir que não há filtros de data aplicados
      if (dateFrom !== undefined || dateTo !== undefined) {
        onDateFromChange(undefined);
        onDateToChange(undefined);
      }
    } else if (periodFilter === "current_month") {
      // Sincronizar com mês atual
      const now = new Date();
      const expectedStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const expectedEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      if (dateFrom !== expectedStart || dateTo !== expectedEnd) {
        onDateFromChange(expectedStart);
        onDateToChange(expectedEnd);
      }
    } else if (periodFilter === "month_picker") {
      // Sincronizar com mês selecionado
      const expectedStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const expectedEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      if (dateFrom !== expectedStart || dateTo !== expectedEnd) {
        onDateFromChange(expectedStart);
        onDateToChange(expectedEnd);
      }
    } else if (periodFilter === "custom" && customStartDate && customEndDate) {
      onDateFromChange(format(customStartDate, 'yyyy-MM-dd'));
      onDateToChange(format(customEndDate, 'yyyy-MM-dd'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilter, selectedMonth, customStartDate, customEndDate]);

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

    if (filterInvoiceMonth !== "all") {
      const [year, month] = filterInvoiceMonth.split("-");
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const label = `Fatura: ${monthNames[parseInt(month, 10) - 1]}/${year}`;
      chips.push({
        id: "invoiceMonth",
        label,
        value: filterInvoiceMonth,
        onRemove: () => onFilterInvoiceMonthChange("all"),
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
    filterInvoiceMonth,
    filterAccountType,
    filterAccount,
    filterCategory,
    periodFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    accounts,
    categories,
    onFilterTypeChange,
    onFilterStatusChange,
    onFilterIsFixedChange,
    onFilterIsProvisionChange,
    onFilterInvoiceMonthChange,
    onFilterAccountTypeChange,
    onFilterAccountChange,
    onFilterCategoryChange,
    handleDateFilterChange,
  ]);

  const clearAllFilters = () => {
    onFilterTypeChange("all");
    onFilterStatusChange("all");
    onFilterIsFixedChange("all");
    onFilterIsProvisionChange("all");
    onFilterInvoiceMonthChange("all");
    onFilterAccountTypeChange("all");
    onFilterAccountChange("all");
    onFilterCategoryChange("all");
    handleDateFilterChange("all");
  };

  // Fetch aggregated totals
  useEffect(() => {
    const fetchAggregatedTotals = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: filterType,
          p_status: filterStatus,
          p_account_id: filterAccount,
          p_category_id: filterCategory,
          p_account_type: filterAccountType,
          p_is_fixed: filterIsFixed !== 'all' ? filterIsFixed === 'true' : undefined,
          p_is_provision: filterIsProvision !== 'all' ? filterIsProvision === 'true' : undefined,
          p_date_from: dateFrom || undefined,
          p_date_to: dateTo || undefined,
          p_search: search || undefined,
        });

        if (error) throw error;
        
        if (data && data.length > 0) {
          setAggregatedTotals({
            income: data[0].total_income,
            expenses: data[0].total_expenses,
            balance: data[0].balance,
          });
        }
      } catch (error) {
        logger.error("Error fetching aggregated totals:", error);
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
