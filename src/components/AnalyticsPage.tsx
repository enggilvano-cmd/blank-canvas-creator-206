import { createDateFromString } from "@/lib/dateUtils";
import { logger } from "@/lib/logger";

import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useChartResponsive } from "@/hooks/useChartResponsive";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  formatCurrencyForAxis,
  getBarChartAxisProps,
} from "@/lib/chartUtils";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Line,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { loadHtmlToImage, loadJsPDF } from "@/lib/lazyImports";
import {
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameYear,
  format,
  isWithinInterval,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { formatCurrency } from "@/lib/formatters";
import { TransactionFilterChips } from "@/components/transactions/TransactionFilterChips";
import { AnalyticsFilterDialog } from "@/components/analytics/AnalyticsFilterDialog";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance: number;
  color: string;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "income" | "expense" | "transfer";
  category: string;
  category_id?: string;
  accountId?: string;
  account_id?: string;
  status: "pending" | "completed";
  to_account_id?: string;
  linked_transaction_id?: string;
  is_provision?: boolean;
}


interface AnalyticsPageProps {
  transactions: Transaction[];
  accounts: Account[];
  initialDateFilter?: "all" | "current_month" | "month_picker" | "custom";
  initialSelectedMonth?: Date;
  initialCustomStartDate?: Date;
  initialCustomEndDate?: Date;
}

interface AnalyticsFilters {
  searchTerm: string;
  filterType: "all" | "income" | "expense" | "transfer";
  filterAccount: string;
  filterCategory: string;
  filterStatus: "all" | "pending" | "completed";
  dateFilter: "all" | "current_month" | "month_picker" | "custom";
  selectedMonth: string;
  customStartDate?: string;
  customEndDate?: string;
  categoryChartType: "expense" | "income";
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: {
    saldo?: number;
    month?: string;
  };
  index: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
];
// Cor de fallback caso uma categoria não tenha cor definida
const FALLBACK_COLOR = "#8884d8";

export default function AnalyticsPage({
  transactions,
  accounts,
  initialDateFilter = "all",
  initialSelectedMonth = new Date(),
  initialCustomStartDate = undefined,
  initialCustomEndDate = undefined,
}: AnalyticsPageProps) {
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<AnalyticsFilters>(
    'analytics-filters',
    {
      searchTerm: "",
      filterType: "all",
      filterAccount: "all",
      filterCategory: "all",
      filterStatus: "all",
      dateFilter: initialDateFilter,
      selectedMonth: initialSelectedMonth.toISOString(),
      customStartDate: initialCustomStartDate?.toISOString(),
      customEndDate: initialCustomEndDate?.toISOString(),
      categoryChartType: "expense",
    }
  );

  // Extract values for easier access
  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;
  const filterAccount = filters.filterAccount;
  const filterCategory = filters.filterCategory;
  const filterStatus = filters.filterStatus;
  const dateFilter = filters.dateFilter;
  const selectedMonth = new Date(filters.selectedMonth);
  const customStartDate = filters.customStartDate ? new Date(filters.customStartDate) : undefined;
  const customEndDate = filters.customEndDate ? new Date(filters.customEndDate) : undefined;


  // Setters
  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));
  const setFilterAccount = (value: string) => setFilters((prev) => ({ ...prev, filterAccount: value }));
  const setFilterCategory = (value: string) => setFilters((prev) => ({ ...prev, filterCategory: value }));
  const setFilterStatus = (value: typeof filters.filterStatus) => setFilters((prev) => ({ ...prev, filterStatus: value }));
  const setDateFilter = (value: typeof filters.dateFilter) => setFilters((prev) => ({ ...prev, dateFilter: value }));
  const setSelectedMonth = (value: Date) => setFilters((prev) => ({ ...prev, selectedMonth: value.toISOString() }));
  const setCustomStartDate = (value: Date | undefined) => setFilters((prev) => ({ ...prev, customStartDate: value?.toISOString() }));
  const setCustomEndDate = (value: Date | undefined) => setFilters((prev) => ({ ...prev, customEndDate: value?.toISOString() }));


  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  
  // States for chart highlighting
  const [activeIncomeIndex, setActiveIncomeIndex] = useState<number | null>(null);
  const [activeExpenseIndex, setActiveExpenseIndex] = useState<number | null>(null);
  const [activeAccountIndex, setActiveAccountIndex] = useState<number | null>(null);
  const [activeCreditCardIndex, setActiveCreditCardIndex] = useState<number | null>(null);
  const [activeCreditCardUsedIndex, setActiveCreditCardUsedIndex] = useState<number | null>(null);
  const [activeOverdraftIndex, setActiveOverdraftIndex] = useState<number | null>(null);
  const [activeOverdraftUsedIndex, setActiveOverdraftUsedIndex] = useState<number | null>(null);
  const [activeInvestmentIndex, setActiveInvestmentIndex] = useState<number | null>(null);
  const [activeSavingsIndex, setActiveSavingsIndex] = useState<number | null>(null);
  const [activeCheckingIndex, setActiveCheckingIndex] = useState<number | null>(null);
  const [activeMealVoucherIndex, setActiveMealVoucherIndex] = useState<number | null>(null);
  const [activeMonthlyKey, setActiveMonthlyKey] = useState<string | null>(null);

  const { toast } = useToast();
  const {
    chartConfig: responsiveConfig,
    isMobile,
    isDesktop,
  } = useChartResponsive();
  
  const chartHeight = isDesktop 
    ? "aspect-auto h-[576px]" 
    : isMobile ? "min-h-[350px]" : responsiveConfig.containerHeight;
  const { categories } = useCategories();
  
  const contentRef = useRef<HTMLDivElement>(null);


  const getTransactionAccountId = (transaction: Transaction) => {
    return transaction.account_id || transaction.accountId || "";
  };

  const getTransactionCategory = (transaction: Transaction) => {
    // Check if it's a transfer
    if (transaction.type === "transfer" || transaction.to_account_id) {
      return "Transferência";
    }

    // Prioritize category_id for more reliable mapping
    if (transaction.category_id) {
      const category = categories.find(
        (cat) => cat.id === transaction.category_id
      );
      return category?.name || "Sem categoria";
    }

    // Fallback to transaction.category if it exists and is not an ID-like string
    if (
      transaction.category &&
      typeof transaction.category === "string" &&
      !transaction.category.match(/^[0-9a-f-]{36}$/i)
    ) {
      return transaction.category;
    }

    return "Sem categoria";
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const transactionDate =
        typeof transaction.date === "string"
          ? createDateFromString(transaction.date)
          : transaction.date;

      const matchesSearch =
        !searchTerm ||
        transaction.description
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        getTransactionCategory(transaction)
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || transaction.type === filterType;
      const matchesAccount =
        filterAccount === "all" ||
        getTransactionAccountId(transaction) === filterAccount;
      const matchesCategory =
        filterCategory === "all" ||
        transaction.category_id === filterCategory;
      const matchesStatus =
        filterStatus === "all" || transaction.status === filterStatus;

      const matchesPeriod =
        dateFilter === "all" ||
        (dateFilter === "current_month" &&
          isSameMonth(transactionDate, new Date()) &&
          isSameYear(transactionDate, new Date())) ||
        (dateFilter === "month_picker" &&
          isWithinInterval(transactionDate, {
            start: startOfMonth(selectedMonth),
            end: endOfMonth(selectedMonth),
          })) ||
        (dateFilter === "custom" &&
          customStartDate &&
          customEndDate &&
          transactionDate >= customStartDate &&
          transactionDate <= customEndDate);

      return (
        matchesSearch &&
        matchesType &&
        matchesAccount &&
        matchesCategory &&
        matchesStatus &&
        matchesPeriod
      );
    });
  }, [
    transactions,
    searchTerm,
    filterType,
    filterAccount,
    filterCategory,
    filterStatus,
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    categories,
  ]);

  // Helper para identificar transações de transferência (ambos os lados)
  const isTransferLike = (transaction: Transaction) => {
    if (transaction.type === 'transfer') return true;
    if (transaction.to_account_id) return true;
    // Apenas excluir receitas espelho de transferências (income + linked_transaction_id)
    // Manter despesas com linked_transaction_id (elas são reais, ex: parcelas)
    if (transaction.type === 'income' && transaction.linked_transaction_id) return true;
    return false;
  };

  // Lista base para gráficos/relatórios: sempre sem transferências
  const nonTransferFilteredTransactions = useMemo(
    () => filteredTransactions.filter((t) => !isTransferLike(t)),
    [filteredTransactions]
  );




  // Dados separados para despesas
  const expenseData = useMemo(() => {
    const expenseTransactions = nonTransferFilteredTransactions.filter(
      (t) => t.type === "expense"
    );

    const categoryFilteredTransactions = expenseTransactions.filter(
      (transaction) => {
        const category = getTransactionCategory(transaction);
        return category !== "Pagamento de Fatura";
      }
    );

    if (categoryFilteredTransactions.length === 0) {
      return [];
    }

    const categoryTotals = categoryFilteredTransactions.reduce(
      (acc, transaction) => {
        const categoryObj = categories.find(
          (c) => c.id === transaction.category_id
        );
        const categoryName = categoryObj?.name || "Sem categoria";
        const categoryColor = categoryObj?.color || FALLBACK_COLOR;

        if (!acc[categoryName]) {
          acc[categoryName] = { amount: 0, color: categoryColor };
        }

        acc[categoryName].amount += Math.abs(transaction.amount);

        return acc;
      },
      {} as Record<string, { amount: number; color: string }>
    );

    const totalAmount = Object.values(categoryTotals).reduce(
      (sum, data) => sum + data.amount,
      0
    );

    const report = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return report.map((item, index) => ({
      ...item,
      fill: item.color || COLORS[index % COLORS.length],
    }));
  }, [nonTransferFilteredTransactions, categories]);

  // Dados separados para receitas
  const incomeData = useMemo(() => {
    const incomeTransactions = nonTransferFilteredTransactions.filter(
      (t) => t.type === "income"
    );

    const categoryFilteredTransactions = incomeTransactions.filter(
      (transaction) => {
        const category = getTransactionCategory(transaction);
        return category !== "Pagamento de Fatura";
      }
    );

    if (categoryFilteredTransactions.length === 0) {
      return [];
    }

    const categoryTotals = categoryFilteredTransactions.reduce(
      (acc, transaction) => {
        const categoryObj = categories.find(
          (c) => c.id === transaction.category_id
        );
        const categoryName = categoryObj?.name || "Sem categoria";
        const categoryColor = categoryObj?.color || FALLBACK_COLOR;

        if (!acc[categoryName]) {
          acc[categoryName] = { amount: 0, color: categoryColor };
        }

        acc[categoryName].amount += transaction.amount;

        return acc;
      },
      {} as Record<string, { amount: number; color: string }>
    );

    const totalAmount = Object.values(categoryTotals).reduce(
      (sum, data) => sum + data.amount,
      0
    );

    const report = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return report.map((item, index) => ({
      ...item,
      fill: item.color || COLORS[index % COLORS.length],
    }));
  }, [nonTransferFilteredTransactions, categories]);


  const transactionsForBalance = useMemo(() => {
    // Return all transactions to show global balance, ignoring filters
    // except maybe account if we want to show balance for specific account?
    // User request: "a linha de acumulados ... nao deve respeitar os filtro"
    // This implies showing the GLOBAL balance history regardless of filters.
    return transactions;
  }, [transactions]);

  const monthlyData = useMemo(() => {
    const monthlyTotals = nonTransferFilteredTransactions.reduce(
      (acc, transaction) => {
        const transactionDate =
          typeof transaction.date === "string"
            ? createDateFromString(transaction.date)
            : transaction.date;
        const monthKey = format(transactionDate, "yyyy-MM");

        if (!acc[monthKey]) {
          acc[monthKey] = { income: 0, expenses: 0 };
        }

        const amount = Math.abs(transaction.amount);

        if (transaction.type === "income") {
          acc[monthKey].income += amount;
        } else if (transaction.type === "expense") {
          acc[monthKey].expenses -= amount;
        }

        return acc;
      },
      {} as Record<string, { income: number; expenses: number }>
    );

    const sortedEntries = Object.entries(monthlyTotals).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    // Helper to calculate balance at the START of a specific date
    // Anchored to the current actual balance from accounts
    const calculateBalanceAtStartOfDate = (targetDate: Date) => {
      // 1. Start with the current actual balance (sum of all accounts)
      // This includes the effect of all COMPLETED transactions up to now
      const currentTotalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      
      const targetDateStr = format(targetDate, 'yyyy-MM-dd');

      // 2. Subtract COMPLETED transactions that happened ON or AFTER the target date
      // We are moving backwards in time, so we reverse the effect of these transactions
      const completedSinceTarget = transactionsForBalance.filter(t => {
        if (isTransferLike(t)) return false;
        if (t.status !== 'completed') return false;
        
        const tDate = typeof t.date === 'string' ? createDateFromString(t.date) : t.date;
        const tDateStr = format(tDate, 'yyyy-MM-dd');
        
        // Include transactions on the target date itself because we want the balance at the START of that day
        return tDateStr >= targetDateStr;
      });
      
      const netChangeSinceTarget = completedSinceTarget.reduce((acc, t) => {
        if (t.type === 'income') return acc + Math.abs(t.amount);
        if (t.type === 'expense') return acc - Math.abs(t.amount);
        return acc;
      }, 0);
      
      // 3. Add PENDING transactions that happened BEFORE the target date
      // These are "debts" or "receivables" that should have affected the balance by that time
      // if we are projecting a "real" balance including pending items
      const pendingBeforeTarget = transactionsForBalance.filter(t => {
        if (isTransferLike(t)) return false;
        if (t.status !== 'pending') return false;
        
        const tDate = typeof t.date === 'string' ? createDateFromString(t.date) : t.date;
        const tDateStr = format(tDate, 'yyyy-MM-dd');

        return tDateStr < targetDateStr;
      });
      
      const netPendingBeforeTarget = pendingBeforeTarget.reduce((acc, t) => {
        if (t.type === 'income') return acc + Math.abs(t.amount);
        if (t.type === 'expense') return acc - Math.abs(t.amount);
        return acc;
      }, 0);
      
      // Formula: Balance(Start) = Current - (Completed >= Start) + (Pending < Start)
      return currentTotalBalance - netChangeSinceTarget + netPendingBeforeTarget;
    };

    const sortedMonths = sortedEntries.map(([monthKey, data]) => {
      const [year, month] = monthKey
        .split("-")
        .map((num) => parseInt(num, 10));
      
      // Calculate balance at the END of this month (which is START of next month)
      // This ensures we show the "Real Balance" at that point in time, regardless of filters
      const nextMonthStart = new Date(year, month, 1); // Month is 0-indexed in Date constructor, so month (1-12) becomes next month index
      const saldoReal = calculateBalanceAtStartOfDate(nextMonthStart);

      return {
        month: format(new Date(year, month - 1, 1), "MMM/yy", {
          locale: ptBR,
        }),
        receitas: data.income,
        despesas: Math.abs(data.expenses),
        saldo: saldoReal,
      };
    });

    return sortedMonths;
  }, [nonTransferFilteredTransactions, transactionsForBalance, accounts]);


  const totalsByType = useMemo(() => {
    return nonTransferFilteredTransactions.reduce(
      (acc, transaction) => {
        const amount = Math.abs(Number(transaction.amount) || 0);
        if (transaction.type === "income") {
          acc.income += amount;
        } else if (transaction.type === "expense") {
          acc.expenses += amount;
        }
        return acc;
      },
      { income: 0, expenses: 0 }
    );
  }, [nonTransferFilteredTransactions]);


  const accountBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type !== "credit" || acc.balance > 0)
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance >= 0 ? account.balance : undefined,
        negativeBalance: account.balance < 0 ? account.balance : undefined,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de saldos de contas
  const accountChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    accountBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [accountBalanceData]);

  // Dados para o gráfico de saldos de cartões de crédito
  const creditCardBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "credit")
      .map((account) => {
        const usedCredit = account.balance < 0 ? Math.abs(account.balance) : 0;
        const surplus = account.balance > 0 ? account.balance : 0;
        const availableCredit = (account.limit_amount || 0) - usedCredit + surplus;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: availableCredit,
          positiveBalance: availableCredit >= 0 ? availableCredit : undefined,
          negativeBalance: availableCredit < 0 ? availableCredit : undefined,
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          usedCredit,
          limitAmount: account.limit_amount || 0,
        };
      });
  }, [accounts]);

  // Chart config específico para o gráfico de cartões de crédito
  const creditCardChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    creditCardBalanceData.forEach((card) => {
      config[card.name] = {
        label: card.name,
        color: card.color,
      };
    });
    return config;
  }, [creditCardBalanceData]);

  // Dados para o gráfico de limite usado dos cartões
  const creditCardUsedData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "credit")
      .map((account) => {
        const usedCredit = account.balance < 0 ? Math.abs(account.balance) : 0;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: usedCredit,
          positiveBalance: usedCredit > 0 ? usedCredit : 0,
          negativeBalance: 0,
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          limitAmount: account.limit_amount || 0,
        };
      });
  }, [accounts]);

  // Chart config para o gráfico de limite usado
  const creditCardUsedChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    creditCardUsedData.forEach((card) => {
      config[card.name] = {
        label: card.name,
        color: card.color,
      };
    });
    return config;
  }, [creditCardUsedData]);

  // Dados para o gráfico de cheque especial (Overdraft)
  const overdraftBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "checking")
      .map((account) => {
        // Se o saldo é negativo, estamos usando o cheque especial
        const usedOverdraft = account.balance < 0 ? Math.abs(account.balance) : 0;
        // O disponível é o limite total menos o que já foi usado
        const availableOverdraft = (account.limit_amount || 0) - usedOverdraft;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: availableOverdraft,
          positiveBalance: availableOverdraft >= 0 ? availableOverdraft : undefined,
          negativeBalance: availableOverdraft < 0 ? availableOverdraft : undefined, // Caso estoure o limite
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          usedOverdraft,
          limitAmount: account.limit_amount || 0,
        };
      });
  }, [accounts]);

  // Chart config para o gráfico de cheque especial
  const overdraftChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    overdraftBalanceData.forEach((acc) => {
      config[acc.name] = {
        label: acc.name,
        color: acc.color,
      };
    });
    return config;
  }, [overdraftBalanceData]);

  // Dados para o gráfico de limite usado do cheque especial
  const overdraftUsedData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "checking")
      .map((account) => {
        const usedOverdraft = account.balance < 0 ? Math.abs(account.balance) : 0;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: usedOverdraft,
          positiveBalance: usedOverdraft > 0 ? usedOverdraft : 0,
          negativeBalance: 0,
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          limitAmount: account.limit_amount || 0,
        };
      });
  }, [accounts]);

  // Chart config para o gráfico de limite usado do cheque especial
  const overdraftUsedChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    overdraftUsedData.forEach((acc) => {
      config[acc.name] = {
        label: acc.name,
        color: acc.color,
      };
    });
    return config;
  }, [overdraftUsedData]);

  // Dados para o gráfico de saldos de contas de investimento
  const investmentBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "investment")
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance >= 0 ? account.balance : undefined,
        negativeBalance: account.balance < 0 ? account.balance : undefined,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de contas de investimento
  const investmentChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    investmentBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [investmentBalanceData]);

  // Dados para o gráfico de saldos de contas poupança
  const savingsBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "savings")
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance >= 0 ? account.balance : undefined,
        negativeBalance: account.balance < 0 ? account.balance : undefined,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de contas poupança
  const savingsChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    savingsBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [savingsBalanceData]);

  // Dados para o gráfico de saldos de contas corrente
  const checkingBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "checking")
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance >= 0 ? account.balance : undefined,
        negativeBalance: account.balance < 0 ? account.balance : undefined,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de contas corrente
  const checkingChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    checkingBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [checkingBalanceData]);

  // Dados para o gráfico de saldos de vale refeição/alimentação
  const mealVoucherBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "meal_voucher")
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance >= 0 ? account.balance : undefined,
        negativeBalance: account.balance < 0 ? account.balance : undefined,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de vale refeição/alimentação
  const mealVoucherChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    mealVoucherBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [mealVoucherBalanceData]);

  const handleExportPDF = async () => {
    if (!contentRef.current) {
      toast({
        title: "Erro",
        description: "Conteúdo não encontrado para exportação.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Gerando Relatório...",
      description: "Preparando documento gerencial em alta qualidade.",
    });

    try {
      // Preparação visual para captura
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Carregar bibliotecas
      const { jsPDF } = await loadJsPDF();
      const htmlToImage = await loadHtmlToImage();

      // Configuração do PDF (A4)
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;
      
      // Cores e Estilos
      const primaryColor = [15, 23, 42]; // Slate 900
      const accentColor = [100, 116, 139]; // Slate 500
      const lineColor = [226, 232, 240]; // Slate 200

      // Função de Cabeçalho
      const addHeader = () => {
        // Fundo do cabeçalho
        pdf.setFillColor(248, 250, 252);
        pdf.rect(0, 0, pageWidth, 35, 'F');
        
        // Título Principal
        pdf.setFontSize(22);
        pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text("Relatório Financeiro", margin, 22);
        
        // Data e Metadados
        pdf.setFontSize(9);
        pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        pdf.setFont("helvetica", "normal");
        
        const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        const time = format(new Date(), "HH:mm", { locale: ptBR });
        
        pdf.text(`${today} às ${time}`, pageWidth - margin, 18, { align: "right" });
        pdf.text("Documento Gerencial", pageWidth - margin, 24, { align: "right" });
        
        // Linha separadora
        pdf.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
        pdf.setLineWidth(0.5);
        pdf.line(margin, 35, pageWidth - margin, 35);
      };

      // Função de Rodapé
      const addFooter = (pageCurrent: number) => {
        pdf.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        
        pdf.setFontSize(8);
        pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        pdf.text("Confidencial - Uso Interno", margin, pageHeight - 10);
        pdf.text(`Página ${pageCurrent}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      };

      let currentY = 45; // Começar abaixo do cabeçalho
      let pageNumber = 1;

      // Iniciar primeira página
      addHeader();

      // 1. Seção de Resumo (Cards do Topo)
      const summarySection = contentRef.current.querySelector(".analytics-section");
      if (summarySection && summarySection instanceof HTMLElement) {
        // Título da Seção
        pdf.setFontSize(14);
        pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text("Resumo Executivo", margin, currentY);
        currentY += 8;

        // Captura dos cards de resumo
        const dataUrl = await htmlToImage.toPng(summarySection, {
          pixelRatio: 3,
          backgroundColor: "#ffffff",
          style: { color: '#0f172a' }
        });

        const imgProps = pdf.getImageProperties(dataUrl);
        const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

        pdf.addImage(dataUrl, "PNG", margin, currentY, contentWidth, imgHeight);
        currentY += imgHeight + 15;
      }

      // 2. Gráficos e Tabelas Detalhadas
      const cards = Array.from(contentRef.current.querySelectorAll(".financial-card"));
      const contentCards = cards.slice(3); // Pular os 3 primeiros cards de resumo

      if (contentCards.length > 0) {
          // Título da Seção de Gráficos
          if (currentY + 20 > pageHeight - 20) {
             addFooter(pageNumber);
             pdf.addPage();
             pageNumber++;
             addHeader();
             currentY = 45;
          }
          
          pdf.setFontSize(14);
          pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          pdf.setFont("helvetica", "bold");
          pdf.text("Análise Detalhada", margin, currentY);
          currentY += 10;
      }

      let i = 0;
      while (i < contentCards.length) {
        const card = contentCards[i] as HTMLElement;
        if (!card) { i++; continue; }

        // Captura do card atual
        const dataUrl1 = await htmlToImage.toPng(card, {
             pixelRatio: 3,
             backgroundColor: "#ffffff",
             style: { color: '#0f172a' }
        });
        const imgProps1 = pdf.getImageProperties(dataUrl1);
        
        // Verificar se podemos colocar lado a lado com o próximo
        let placedSideBySide = false;
        
        if (i + 1 < contentCards.length) {
            const nextCard = contentCards[i+1] as HTMLElement;
            
            // Heurística: Agrupar se ambos não forem tabelas e não forem o gráfico de evolução mensal (que é largo)
            const isTable1 = card.querySelector('table') !== null;
            const isTable2 = nextCard.querySelector('table') !== null;
            const title1 = card.querySelector("h3")?.textContent || "";
            const title2 = nextCard.querySelector("h3")?.textContent || "";
            const isWide1 = title1.includes("Evolução Mensal");
            const isWide2 = title2.includes("Evolução Mensal");

            if (!isTable1 && !isTable2 && !isWide1 && !isWide2) {
                 const dataUrl2 = await htmlToImage.toPng(nextCard, {
                    pixelRatio: 3,
                    backgroundColor: "#ffffff",
                    style: { color: '#0f172a' }
                 });
                 const imgProps2 = pdf.getImageProperties(dataUrl2);

                 // Layout de 2 colunas
                 const gap = 10;
                 const colWidth = (contentWidth - gap) / 2;
                 
                 // Calcular alturas proporcionais
                 const h1 = (colWidth / imgProps1.width) * imgProps1.height;
                 const h2 = (colWidth / imgProps2.width) * imgProps2.height;
                 const maxHeight = Math.max(h1, h2);

                 // Verificar quebra de página
                 if (currentY + maxHeight + 10 > pageHeight - 20) {
                    addFooter(pageNumber);
                    pdf.addPage();
                    pageNumber++;
                    addHeader();
                    currentY = 45;
                 }

                 pdf.addImage(dataUrl1, "PNG", margin, currentY, colWidth, h1);
                 pdf.addImage(dataUrl2, "PNG", margin + colWidth + gap, currentY, colWidth, h2);

                 currentY += maxHeight + 15;
                 i += 2;
                 placedSideBySide = true;
            }
        }

        if (!placedSideBySide) {
            // Renderizar largura total
            const imgHeight = (imgProps1.height * contentWidth) / imgProps1.width;
            
            if (currentY + imgHeight + 10 > pageHeight - 20) {
                addFooter(pageNumber);
                pdf.addPage();
                pageNumber++;
                addHeader();
                currentY = 45;
            }

            pdf.addImage(dataUrl1, "PNG", margin, currentY, contentWidth, imgHeight);
            currentY += imgHeight + 15;
            i++;
        }
      }

      // Finalizar última página
      addFooter(pageNumber);

      // Nome do arquivo
      const periodLabel =
        dateFilter === "current_month"
          ? format(new Date(), "MMMM-yyyy", { locale: ptBR })
          : dateFilter === "month_picker"
          ? format(selectedMonth, "MMMM-yyyy", { locale: ptBR })
          : "personalizado";
      
      pdf.save(`Relatorio_Gerencial_${periodLabel}.pdf`);

      toast({
        title: "Relatório Exportado",
        description: "O download do seu relatório gerencial foi iniciado.",
      });

    } catch (error) {
      logger.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro na Exportação",
        description: "Não foi possível gerar o documento PDF. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const chartConfig = {
    receitas: {
      label: "Receitas",
      color: "hsl(var(--success))",
    },
    despesas: {
      label: "Despesas",
      color: "hsl(var(--destructive))",
    },
    saldo: {
      label: "Saldo Acumulado",
      color: "hsl(var(--primary))",
    },
  };

  // Chart config específico para o gráfico de categorias
  // Memoize tooltip formatters to prevent re-renders
  const categoryTooltipFormatter = useMemo(
    () => (value: number, name: string) => [formatCurrency(value), ` - ${name}`],
    [formatCurrency]
  );

  const accountTooltipFormatter = useMemo(
    () => (value: number, _name: string, props: any) => {
      // Show only the actual balance value, not the split values
      if (props?.payload?.balance !== undefined) {
        return [formatCurrency(props.payload.balance * 100), " - Saldo"];
      }
      return [formatCurrency(value * 100), " - Saldo"];
    },
    [formatCurrency]
  );

  const monthlyTooltipFormatter = useMemo(
    () => (value: number, name: string) => [
      formatCurrency(value),
      name === "receitas"
        ? " - Receitas"
        : name === "despesas"
        ? " - Despesas"
        : name === "saldo"
        ? " - Saldo Acumulado"
        : ` - ${name}`,
    ],
    [formatCurrency]
  );

  // Memoize custom dot renderer with unique keys for Line chart
  const renderMonthlyDot = useMemo(
    () => (props: DotProps) => {
      const { cx, cy, payload, index } = props;
      const saldo = payload?.saldo || 0;
      const uniqueKey = `monthly-dot-${index}-${payload?.month || index}`;
      return (
        <circle
          key={uniqueKey}
          cx={cx}
          cy={cy}
          r={isMobile ? 3 : 4}
          fill={
            saldo >= 0
              ? "hsl(var(--primary))"
              : "hsl(var(--destructive))"
          }
          stroke="hsl(var(--background))"
          strokeWidth={2}
        />
      );
    },
    [isMobile]
  );

  const categoryChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    
    // Process income data
    incomeData.forEach((item, index) => {
      config[item.category] = {
        label: item.category,
        color: item.fill || COLORS[index % COLORS.length],
      };
    });

    // Process expense data
    expenseData.forEach((item, index) => {
      config[item.category] = {
        label: item.category,
        color: item.fill || COLORS[index % COLORS.length],
      };
    });

    return config;
  }, [incomeData, expenseData]);

  // Filter chips configuration
  const filterChips = useMemo(() => {
    const chips: Array<{
      id: string;
      label: string;
      value: string;
      color?: string;
      onRemove: () => void;
    }> = [];

    if (searchTerm) {
      chips.push({
        id: "search",
        label: `Busca: ${searchTerm}`,
        value: searchTerm,
        onRemove: () => setSearchTerm(""),
      });
    }

    if (filterType !== "all") {
      const typeLabels = {
        income: "Receitas",
        expense: "Despesas",
        transfer: "Transferências",
      };
      chips.push({
        id: "type",
        label: `Tipo: ${typeLabels[filterType as keyof typeof typeLabels]}`,
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    if (filterAccount !== "all") {
      const account = accounts.find((a) => a.id === filterAccount);
      chips.push({
        id: "account",
        label: `Conta: ${account?.name || filterAccount}`,
        value: filterAccount,
        color: account?.color,
        onRemove: () => setFilterAccount("all"),
      });
    }

    if (filterCategory !== "all") {
      const category = categories.find((c) => c.id === filterCategory);
      chips.push({
        id: "category",
        label: `Categoria: ${category?.name || filterCategory}`,
        value: filterCategory,
        color: category?.color,
        onRemove: () => setFilterCategory("all"),
      });
    }

    if (filterStatus !== "all") {
      const statusLabels = {
        completed: "Concluídas",
        pending: "Pendentes",
      };
      chips.push({
        id: "status",
        label: `Status: ${statusLabels[filterStatus as keyof typeof statusLabels]}`,
        value: filterStatus,
        onRemove: () => setFilterStatus("all"),
      });
    }

    if (dateFilter !== "all") {
      const periodLabels = {
        current_month: "Mês Atual",
        month_picker: "Navegar por Mês",
        custom: "Personalizado",
      };
      chips.push({
        id: "period",
        label: `Período: ${periodLabels[dateFilter as keyof typeof periodLabels]}`,
        value: dateFilter,
        onRemove: () => setDateFilter("all"),
      });
    }

    return chips;
  }, [searchTerm, filterType, filterAccount, filterCategory, filterStatus, dateFilter, accounts, categories]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterType("all");
    setFilterAccount("all");
    setFilterCategory("all");
    setFilterStatus("all");
    setDateFilter("all");
  };

  // Helper to check if charts have non-zero values
  const showMonthlyChart = useMemo(() => {
    return monthlyData.some(d => d.receitas !== 0 || d.despesas !== 0 || d.saldo !== 0);
  }, [monthlyData]);

  const showIncomeChart = incomeData.length > 0;
  const showExpenseChart = expenseData.length > 0;

  const showAccountBalanceChart = useMemo(() => {
    return accountBalanceData.some(d => d.balance !== 0);
  }, [accountBalanceData]);

  const showInvestmentChart = useMemo(() => {
    return investmentBalanceData.some(d => d.balance !== 0);
  }, [investmentBalanceData]);

  const showSavingsChart = useMemo(() => {
    return savingsBalanceData.some(d => d.balance !== 0);
  }, [savingsBalanceData]);

  const showCheckingChart = useMemo(() => {
    return checkingBalanceData.some(d => d.balance !== 0);
  }, [checkingBalanceData]);

  const showMealVoucherChart = useMemo(() => {
    return mealVoucherBalanceData.some(d => d.balance !== 0);
  }, [mealVoucherBalanceData]);

  const showCreditCardBalanceChart = useMemo(() => {
    return creditCardBalanceData.some(d => d.balance !== 0);
  }, [creditCardBalanceData]);

  const showCreditCardUsedChart = useMemo(() => {
    return creditCardUsedData.some(d => d.balance !== 0);
  }, [creditCardUsedData]);

  const showOverdraftBalanceChart = useMemo(() => {
    return overdraftBalanceData.some(d => d.balance !== 0);
  }, [overdraftBalanceData]);

  const showOverdraftUsedChart = useMemo(() => {
    return overdraftUsedData.some(d => d.balance !== 0);
  }, [overdraftUsedData]);

  return (
    <div ref={contentRef} className="spacing-responsive-md fade-in pb-6 sm:pb-8">
      {/* Summary Cards */}
      <div className="analytics-section grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="financial-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-caption font-medium">Receitas</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className="balance-text balance-positive">
                {formatCurrency(totalsByType.income * 100)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-caption font-medium">Despesas</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className="balance-text balance-negative">
                {formatCurrency(totalsByType.expenses * 100)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card col-span-2 md:col-span-2 lg:col-span-1">
          <CardContent className="p-2 sm:p-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-caption font-medium">Saldo Líquido</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className={`balance-text ${
                totalsByType.income - totalsByType.expenses >= 0 ? "balance-positive" : "balance-negative"
              }`}>
                {formatCurrency((totalsByType.income - totalsByType.expenses) * 100)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mt-6 sm:mt-8">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4">
            {/* Filter button and active chips */}
            <div className="flex flex-wrap items-center gap-3">
              <AnalyticsFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                filterStatus={filterStatus}
                onFilterStatusChange={(value) => setFilterStatus(value as typeof filterStatus)}
                filterAccount={filterAccount}
                onFilterAccountChange={setFilterAccount}
                filterCategory={filterCategory}
                onFilterCategoryChange={setFilterCategory}
                dateFilter={dateFilter}
                onDateFilterChange={(value) => setDateFilter(value as typeof dateFilter)}
                customStartDate={customStartDate}
                onCustomStartDateChange={setCustomStartDate}
                customEndDate={customEndDate}
                onCustomEndDateChange={setCustomEndDate}
                accounts={accounts}
                categories={categories}
                activeFiltersCount={filterChips.length}
              />
              
              <TransactionFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search and Period Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar transações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Period Navigation - visível apenas quando selecionado */}
              {dateFilter === "month_picker" && (
                <div className="flex items-center gap-2 px-3 border border-input rounded-md bg-background min-w-[220px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex-1 text-center text-sm font-medium">
                    {format(selectedMonth, "MMM/yyyy", { locale: ptBR })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Custom Date Range Display */}
              {dateFilter === "custom" && customStartDate && customEndDate && (
                <div className="flex items-center gap-2 px-3 border border-input rounded-md bg-background min-w-[220px]">
                  <span className="text-sm font-medium whitespace-nowrap">
                    {format(customStartDate, "dd/MM/yyyy", { locale: ptBR })} - {format(customEndDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="analytics-section grid grid-cols-1 gap-6 sm:gap-8 mt-6 sm:mt-8">
        {/* Monthly Trend */}
        {showMonthlyChart && (
        <Card className="financial-card">
          <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
              Evolução Mensal - Receitas vs Despesas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <div className="relative w-full">
              <ChartContainer
                config={chartConfig}
                className={`${chartHeight} w-full overflow-hidden`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthlyData}
                    margin={{
                      top: 20,
                      right: isMobile ? 15 : 240,
                      bottom: isMobile ? 0 : 30,
                      left: isMobile ? 0 : 20
                    }}
                  >
                    <XAxis
                      dataKey="month"
                      {...getBarChartAxisProps(responsiveConfig).xAxis}
                      height={isMobile ? 45 : undefined}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      {...getBarChartAxisProps(responsiveConfig).yAxis}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={monthlyTooltipFormatter}
                      labelFormatter={(label) => `Mês de ${label}`}
                    />

                    {/* Barras de Receitas com cor sólida */}
                    <Bar
                      dataKey="receitas"
                      fill="hsl(var(--success))"
                      radius={[4, 4, 0, 0]}
                      name="Receitas"
                      onMouseEnter={() => setActiveMonthlyKey('receitas')}
                      onMouseLeave={() => setActiveMonthlyKey(null)}
                      onClick={() => setActiveMonthlyKey(activeMonthlyKey === 'receitas' ? null : 'receitas')}
                      fillOpacity={activeMonthlyKey !== null && activeMonthlyKey !== 'receitas' ? 0.3 : 1}
                      style={{
                        transition: 'fill-opacity 0.3s ease',
                        cursor: 'pointer'
                      }}
                    />

                    {/* Barras de Despesas com cor sólida */}
                    <Bar
                      dataKey="despesas"
                      fill="hsl(var(--destructive))"
                      radius={[4, 4, 0, 0]}
                      name="Despesas"
                      onMouseEnter={() => setActiveMonthlyKey('despesas')}
                      onMouseLeave={() => setActiveMonthlyKey(null)}
                      onClick={() => setActiveMonthlyKey(activeMonthlyKey === 'despesas' ? null : 'despesas')}
                      fillOpacity={activeMonthlyKey !== null && activeMonthlyKey !== 'despesas' ? 0.3 : 1}
                      style={{
                        transition: 'fill-opacity 0.3s ease',
                        cursor: 'pointer'
                      }}
                    />

                    {/* Linha de saldo com pontos condicionais */}
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      stroke="hsl(var(--primary))"
                      strokeWidth={isMobile ? 2 : 3}
                      dot={renderMonthlyDot}
                      activeDot={{
                        r: isMobile ? 5 : 6,
                        strokeWidth: 2,
                        fill: "hsl(var(--primary))",
                        stroke: "hsl(var(--background))",
                      }}
                      connectNulls={false}
                      name="Saldo Acumulado"
                      onMouseEnter={() => setActiveMonthlyKey('saldo')}
                      onMouseLeave={() => setActiveMonthlyKey(null)}
                      onClick={() => setActiveMonthlyKey(activeMonthlyKey === 'saldo' ? null : 'saldo')}
                      strokeOpacity={activeMonthlyKey !== null && activeMonthlyKey !== 'saldo' ? 0.3 : 1}
                      style={{
                        transition: 'stroke-opacity 0.3s ease',
                        cursor: 'pointer'
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda - desktop/tablet (dentro do container) */}
              {!isMobile && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {Object.entries(chartConfig).map(([key, config]) => {
                    const value = key === 'receitas' ? totalsByType.income :
                                  key === 'despesas' ? totalsByType.expenses :
                                  (monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].saldo : 0);
                    
                    const textColor = key === 'receitas' ? 'text-success' :
                                      key === 'despesas' ? 'text-destructive' :
                                      value >= 0 ? 'text-success' : 'text-destructive';

                    return (
                      <div 
                        key={`legend-monthly-desktop-${key}`} 
                        className={cn(
                          "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                          activeMonthlyKey === key ? "bg-muted/50 scale-105 font-medium" : "",
                          activeMonthlyKey !== null && activeMonthlyKey !== key ? "opacity-30" : "opacity-100"
                        )}
                        onMouseEnter={() => setActiveMonthlyKey(key)}
                        onMouseLeave={() => setActiveMonthlyKey(null)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: config.color }}
                          />
                          <span className="truncate text-foreground">
                            {config.label}
                          </span>
                        </div>
                        <span className={`font-medium flex-shrink-0 ${textColor}`}>
                          {formatCurrency(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legenda - mobile (abaixo do gráfico) */}
            {isMobile && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                  {Object.entries(chartConfig).map(([key, config]) => {
                  const value = key === 'receitas' ? totalsByType.income :
                                key === 'despesas' ? totalsByType.expenses :
                                (monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].saldo : 0);
                  
                  const textColor = key === 'receitas' ? 'text-success' :
                                    key === 'despesas' ? 'text-destructive' :
                                    value >= 0 ? 'text-success' : 'text-destructive';                  return (
                    <div 
                      key={`legend-monthly-mobile-${key}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeMonthlyKey === key ? "bg-muted/50 scale-105 font-medium" : "",
                        activeMonthlyKey !== null && activeMonthlyKey !== key ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveMonthlyKey(activeMonthlyKey === key ? null : key)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="truncate text-foreground">
                          {config.label}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${textColor}`}>
                        {formatCurrency(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Income Category Pie Chart */}
        {showIncomeChart && (
        <Card className="financial-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              Receitas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <div className="relative w-full">
              <ChartContainer
                config={categoryChartConfig}
                className={`${chartHeight} w-full overflow-hidden`}
              >
               <RechartsPieChart width={undefined} height={undefined}>
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={categoryTooltipFormatter}
                />
                <Pie
                  data={incomeData.map((item) => ({
                    ...item,
                    name: item.category,
                    value: item.amount,
                  }))}
                  cx={isMobile ? "50%" : "35%"}
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={isMobile ? "100%" : responsiveConfig.outerRadius}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {incomeData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.fill} 
                      stroke={activeIncomeIndex === index ? "hsl(var(--background))" : "none"}
                      strokeWidth={activeIncomeIndex === index ? 2 : 0}
                      style={{
                        opacity: activeIncomeIndex !== null && activeIncomeIndex !== index ? 0.3 : 1,
                        transition: 'opacity 0.3s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={() => setActiveIncomeIndex(index)}
                      onMouseLeave={() => setActiveIncomeIndex(null)}
                      onClick={() => setActiveIncomeIndex(activeIncomeIndex === index ? null : index)}
                    />
                  ))}
                </Pie>
              </RechartsPieChart>
              
              {/* Custom Legend - desktop/tablet (ao lado do gráfico) */}
              {!isMobile && incomeData.length > 0 && (
                <div 
                  className={cn(
                    "flex flex-col gap-2 px-4 absolute right-4 top-1/2 -translate-y-1/2",
                  )}
                  style={{ maxWidth: "35%" }}
                >
                  {incomeData.map((item, index) => (
                    <div 
                      key={`legend-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeIncomeIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeIncomeIndex !== null && activeIncomeIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveIncomeIndex(index)}
                      onMouseLeave={() => setActiveIncomeIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className="truncate text-foreground">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-medium flex-shrink-0">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ChartContainer>
            </div>

            {/* Custom Legend - mobile (abaixo do gráfico) */}
            {isMobile && incomeData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {incomeData.map((item, index) => (
                  <div 
                    key={`legend-mobile-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeIncomeIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeIncomeIndex !== null && activeIncomeIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onClick={() => setActiveIncomeIndex(activeIncomeIndex === index ? null : index)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="truncate text-foreground">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-medium flex-shrink-0">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {incomeData.length === 0 && (
              <div className="text-body text-center text-muted-foreground py-8">
                Nenhuma receita encontrada para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Expense Category Pie Chart */}
        {showExpenseChart && (
        <Card className="financial-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <div className="relative w-full">
              <ChartContainer
                config={categoryChartConfig}
                className={`${chartHeight} w-full overflow-hidden`}
              >
               <RechartsPieChart width={undefined} height={undefined}>
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={categoryTooltipFormatter}
                />
                <Pie
                  data={expenseData.map((item) => ({
                    ...item,
                    name: item.category,
                    value: item.amount,
                  }))}
                  cx={isMobile ? "50%" : "35%"}
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={isMobile ? "100%" : responsiveConfig.outerRadius}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {expenseData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.fill} 
                      stroke={activeExpenseIndex === index ? "hsl(var(--background))" : "none"}
                      strokeWidth={activeExpenseIndex === index ? 2 : 0}
                      style={{
                        opacity: activeExpenseIndex !== null && activeExpenseIndex !== index ? 0.3 : 1,
                        transition: 'opacity 0.3s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={() => setActiveExpenseIndex(index)}
                      onMouseLeave={() => setActiveExpenseIndex(null)}
                      onClick={() => setActiveExpenseIndex(activeExpenseIndex === index ? null : index)}
                    />
                  ))}
                </Pie>
              </RechartsPieChart>
              
              {/* Custom Legend - desktop/tablet (ao lado do gráfico) */}
              {!isMobile && expenseData.length > 0 && (
                <div 
                  className={cn(
                    "flex flex-col gap-2 px-4 absolute right-4 top-1/2 -translate-y-1/2",
                  )}
                  style={{ maxWidth: "35%" }}
                >
                  {expenseData.map((item, index) => (
                    <div 
                      key={`legend-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeExpenseIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeExpenseIndex !== null && activeExpenseIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveExpenseIndex(index)}
                      onMouseLeave={() => setActiveExpenseIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className="truncate text-foreground">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-medium flex-shrink-0">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ChartContainer>
            </div>

            {/* Custom Legend - mobile (abaixo do gráfico) */}
            {isMobile && expenseData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {expenseData.map((item, index) => (
                  <div 
                    key={`legend-mobile-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeExpenseIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeExpenseIndex !== null && activeExpenseIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onClick={() => setActiveExpenseIndex(activeExpenseIndex === index ? null : index)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="truncate text-foreground">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-medium flex-shrink-0">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {expenseData.length === 0 && (
              <div className="text-body text-center text-muted-foreground py-8">
                Nenhuma despesa encontrada para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Account Balances */}
        {showAccountBalanceChart && (
        <Card className="financial-card">
          <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              Saldos por Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <div className="relative w-full">
              <ChartContainer
                config={accountChartConfig}
                className={`${chartHeight} w-full overflow-hidden`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={accountBalanceData}
                    margin={{
                      top: 20,
                      right: isMobile ? 15 : 240,
                      bottom: isMobile ? 0 : 30,
                      left: isMobile ? 0 : 20
                    }}
                  >
                  <XAxis
                    dataKey="name"
                    tick={false}
                    axisLine={false}
                    height={0}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatCurrencyForAxis(value / 100, isMobile)
                    }
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 35 : 60}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={accountTooltipFormatter}
                   />
                   <Bar 
                     dataKey="positiveBalance" 
                     stackId="balance" 
                     fill="hsl(var(--success))"
                   >
                     {accountBalanceData.map((entry, index) => (
                       <Cell 
                         key={`cell-positive-${index}`} 
                         fill={entry.balance > 0 ? entry.color : "transparent"} 
                         style={{
                           opacity: activeAccountIndex !== null && activeAccountIndex !== index ? 0.3 : 1,
                           transition: 'opacity 0.3s ease',
                           cursor: 'pointer'
                         }}
                         onMouseEnter={() => setActiveAccountIndex(index)}
                         onMouseLeave={() => setActiveAccountIndex(null)}
                         onClick={() => setActiveAccountIndex(activeAccountIndex === index ? null : index)}
                       />
                     ))}
                   </Bar>
                   <Bar 
                     dataKey="negativeBalance" 
                     stackId="balance" 
                     fill="hsl(var(--destructive))"
                   >
                     {accountBalanceData.map((entry, index) => (
                       <Cell 
                         key={`cell-negative-${index}`} 
                         fill={entry.balance < 0 ? entry.color : "transparent"} 
                         style={{
                           opacity: activeAccountIndex !== null && activeAccountIndex !== index ? 0.3 : 1,
                           transition: 'opacity 0.3s ease',
                           cursor: 'pointer'
                         }}
                         onMouseEnter={() => setActiveAccountIndex(index)}
                         onMouseLeave={() => setActiveAccountIndex(null)}
                         onClick={() => setActiveAccountIndex(activeAccountIndex === index ? null : index)}
                       />
                     ))}
                   </Bar>
                 </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Legenda de Contas - desktop/tablet (dentro do container) */}
            {!isMobile && accountBalanceData.length > 0 && (
              <div 
                className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                style={{ maxWidth: "38%" }}
              >
                {accountBalanceData.map((account, index) => (
                  <div 
                    key={`legend-account-desktop-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeAccountIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeAccountIndex !== null && activeAccountIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onMouseEnter={() => setActiveAccountIndex(index)}
                    onMouseLeave={() => setActiveAccountIndex(null)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: account.color }}
                      />
                      <span className="truncate text-foreground">
                        {account.name}
                      </span>
                    </div>
                    <span className={`font-medium flex-shrink-0 ${
                      account.balance >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(account.balance * 100)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                  <span className="font-medium text-foreground pl-5">Total</span>
                  <span className={`font-medium flex-shrink-0 ${
                    accountBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(accountBalanceData.reduce((acc, curr) => acc + curr.balance, 0) * 100)}
                  </span>
                </div>
              </div>
            )}
            </div>

            {/* Legenda de Contas - mobile (abaixo do gráfico) */}
            {isMobile && accountBalanceData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {accountBalanceData.map((account, index) => (
                  <div 
                    key={`legend-account-mobile-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeAccountIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeAccountIndex !== null && activeAccountIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onClick={() => setActiveAccountIndex(activeAccountIndex === index ? null : index)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: account.color }}
                      />
                      <span className="truncate text-foreground">
                        {account.name}
                      </span>
                    </div>
                    <span className={`font-medium flex-shrink-0 ${
                      account.balance >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(account.balance * 100)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                  <span className="font-medium text-foreground pl-5">Total</span>
                  <span className={`font-medium flex-shrink-0 ${
                    accountBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(accountBalanceData.reduce((acc, curr) => acc + curr.balance, 0) * 100)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Investment Account Balances */}
        {showInvestmentChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Saldo de Conta Investimento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={investmentChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={investmentBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={accountTooltipFormatter}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--success))"
                     >
                       {investmentBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-investment-positive-${index}`} 
                           fill={entry.balance > 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeInvestmentIndex !== null && activeInvestmentIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveInvestmentIndex(index)}
                           onMouseLeave={() => setActiveInvestmentIndex(null)}
                           onClick={() => setActiveInvestmentIndex(activeInvestmentIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                     <Bar 
                       dataKey="negativeBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {investmentBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-investment-negative-${index}`} 
                           fill={entry.balance < 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeInvestmentIndex !== null && activeInvestmentIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveInvestmentIndex(index)}
                           onMouseLeave={() => setActiveInvestmentIndex(null)}
                           onClick={() => setActiveInvestmentIndex(activeInvestmentIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Contas de Investimento - desktop/tablet */}
              {!isMobile && investmentBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {investmentBalanceData.map((account, index) => (
                    <div 
                      key={`legend-investment-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeInvestmentIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeInvestmentIndex !== null && activeInvestmentIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveInvestmentIndex(index)}
                      onMouseLeave={() => setActiveInvestmentIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      investmentBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(investmentBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Contas de Investimento - mobile */}
              {isMobile && investmentBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {investmentBalanceData.map((account, index) => (
                    <div 
                      key={`legend-investment-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeInvestmentIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeInvestmentIndex !== null && activeInvestmentIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveInvestmentIndex(activeInvestmentIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      investmentBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(investmentBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Savings Account Balances */}
        {showSavingsChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Saldo de Conta Poupança
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={savingsChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={savingsBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={accountTooltipFormatter}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--success))"
                     >
                       {savingsBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-savings-positive-${index}`} 
                           fill={entry.balance > 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeSavingsIndex !== null && activeSavingsIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveSavingsIndex(index)}
                           onMouseLeave={() => setActiveSavingsIndex(null)}
                           onClick={() => setActiveSavingsIndex(activeSavingsIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                     <Bar 
                       dataKey="negativeBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {savingsBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-savings-negative-${index}`} 
                           fill={entry.balance < 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeSavingsIndex !== null && activeSavingsIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveSavingsIndex(index)}
                           onMouseLeave={() => setActiveSavingsIndex(null)}
                           onClick={() => setActiveSavingsIndex(activeSavingsIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Contas Poupança - desktop/tablet */}
              {!isMobile && savingsBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {savingsBalanceData.map((account, index) => (
                    <div 
                      key={`legend-savings-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeSavingsIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeSavingsIndex !== null && activeSavingsIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveSavingsIndex(index)}
                      onMouseLeave={() => setActiveSavingsIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      savingsBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(savingsBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Contas Poupança - mobile */}
              {isMobile && savingsBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {savingsBalanceData.map((account, index) => (
                    <div 
                      key={`legend-savings-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeSavingsIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeSavingsIndex !== null && activeSavingsIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveSavingsIndex(activeSavingsIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      savingsBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(savingsBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credit Card Balances */}

        {/* Checking Account Balances */}
        {showCheckingChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Saldo de Conta Corrente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={checkingChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={checkingBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={accountTooltipFormatter}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--success))"
                     >
                       {checkingBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-checking-positive-${index}`} 
                           fill={entry.balance > 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeCheckingIndex !== null && activeCheckingIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveCheckingIndex(index)}
                           onMouseLeave={() => setActiveCheckingIndex(null)}
                           onClick={() => setActiveCheckingIndex(activeCheckingIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                     <Bar 
                       dataKey="negativeBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {checkingBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-checking-negative-${index}`} 
                           fill={entry.balance < 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeCheckingIndex !== null && activeCheckingIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveCheckingIndex(index)}
                           onMouseLeave={() => setActiveCheckingIndex(null)}
                           onClick={() => setActiveCheckingIndex(activeCheckingIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Contas Corrente - desktop/tablet */}
              {!isMobile && checkingBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {checkingBalanceData.map((account, index) => (
                    <div 
                      key={`legend-checking-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeCheckingIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeCheckingIndex !== null && activeCheckingIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveCheckingIndex(index)}
                      onMouseLeave={() => setActiveCheckingIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      checkingBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(checkingBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Contas Corrente - mobile */}
              {isMobile && checkingBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {checkingBalanceData.map((account, index) => (
                    <div 
                      key={`legend-checking-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeCheckingIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeCheckingIndex !== null && activeCheckingIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveCheckingIndex(activeCheckingIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      checkingBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(checkingBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Meal Voucher Account Balances */}
        {showMealVoucherChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Saldo de Vale Refeição/Alimentação
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={mealVoucherChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mealVoucherBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={accountTooltipFormatter}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--success))"
                     >
                       {mealVoucherBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-meal-voucher-positive-${index}`} 
                           fill={entry.balance > 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeMealVoucherIndex !== null && activeMealVoucherIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveMealVoucherIndex(index)}
                           onMouseLeave={() => setActiveMealVoucherIndex(null)}
                           onClick={() => setActiveMealVoucherIndex(activeMealVoucherIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                     <Bar 
                       dataKey="negativeBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {mealVoucherBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-meal-voucher-negative-${index}`} 
                           fill={entry.balance < 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeMealVoucherIndex !== null && activeMealVoucherIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveMealVoucherIndex(index)}
                           onMouseLeave={() => setActiveMealVoucherIndex(null)}
                           onClick={() => setActiveMealVoucherIndex(activeMealVoucherIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Vale Refeição/Alimentação - desktop/tablet */}
              {!isMobile && mealVoucherBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {mealVoucherBalanceData.map((account, index) => (
                    <div 
                      key={`legend-meal-voucher-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeMealVoucherIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeMealVoucherIndex !== null && activeMealVoucherIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveMealVoucherIndex(index)}
                      onMouseLeave={() => setActiveMealVoucherIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      mealVoucherBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(mealVoucherBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Vale Refeição/Alimentação - mobile */}
              {isMobile && mealVoucherBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {mealVoucherBalanceData.map((account, index) => (
                    <div 
                      key={`legend-meal-voucher-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeMealVoucherIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeMealVoucherIndex !== null && activeMealVoucherIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveMealVoucherIndex(activeMealVoucherIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: account.color }}
                        />
                        <span className="truncate text-foreground">
                          {account.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        account.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(account.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      mealVoucherBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(mealVoucherBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credit Card Balances */}
        {showCreditCardBalanceChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Crédito Disponível - Cartões
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={creditCardChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={creditCardBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance * 100), " - Crédito Disponível"];
                        }
                        return [formatCurrency(value), " - Crédito Disponível"];
                      }}
                     />
                     <Bar 
                     dataKey="positiveBalance" 
                     stackId="balance" 
                     fill="hsl(var(--success))"
                   >
                     {creditCardBalanceData.map((entry, index) => (
                       <Cell 
                         key={`cell-credit-positive-${index}`} 
                         fill={entry.balance > 0 ? entry.color : "transparent"} 
                         style={{
                           opacity: activeCreditCardIndex !== null && activeCreditCardIndex !== index ? 0.3 : 1,
                           transition: 'opacity 0.3s ease',
                           cursor: 'pointer'
                         }}
                         onMouseEnter={() => setActiveCreditCardIndex(index)}
                         onMouseLeave={() => setActiveCreditCardIndex(null)}
                         onClick={() => setActiveCreditCardIndex(activeCreditCardIndex === index ? null : index)}
                       />
                     ))}
                   </Bar>
                   <Bar 
                     dataKey="negativeBalance" 
                     stackId="balance" 
                     fill="hsl(var(--destructive))"
                   >
                     {creditCardBalanceData.map((entry, index) => (
                       <Cell 
                         key={`cell-credit-negative-${index}`} 
                         fill={entry.balance < 0 ? entry.color : "transparent"} 
                         style={{
                           opacity: activeCreditCardIndex !== null && activeCreditCardIndex !== index ? 0.3 : 1,
                           transition: 'opacity 0.3s ease',
                           cursor: 'pointer'
                         }}
                         onMouseEnter={() => setActiveCreditCardIndex(index)}
                         onMouseLeave={() => setActiveCreditCardIndex(null)}
                         onClick={() => setActiveCreditCardIndex(activeCreditCardIndex === index ? null : index)}
                       />
                     ))}
                   </Bar>
                 </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Legenda de Cartões - desktop/tablet (dentro do container) */}
            {!isMobile && creditCardBalanceData.length > 0 && (
              <div 
                className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                style={{ maxWidth: "38%" }}
              >
                {creditCardBalanceData.map((card, index) => (
                  <div 
                    key={`legend-credit-desktop-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeCreditCardIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeCreditCardIndex !== null && activeCreditCardIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onMouseEnter={() => setActiveCreditCardIndex(index)}
                    onMouseLeave={() => setActiveCreditCardIndex(null)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: card.color }}
                      />
                      <span className="truncate text-foreground">
                        {card.name}
                      </span>
                    </div>
                    <span className={`font-medium flex-shrink-0 ${
                      card.balance >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(card.balance * 100)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                  <span className="font-medium text-foreground pl-5">Total</span>
                  <span className={`font-medium flex-shrink-0 ${
                    creditCardBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(creditCardBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                  </span>
                </div>
              </div>
            )}
            </div>

            {/* Legenda de Cartões - mobile (abaixo do gráfico) */}
            {isMobile && creditCardBalanceData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {creditCardBalanceData.map((card, index) => (
                  <div 
                    key={`legend-credit-mobile-${index}`} 
                    className={cn(
                      "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                      activeCreditCardIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                      activeCreditCardIndex !== null && activeCreditCardIndex !== index ? "opacity-30" : "opacity-100"
                    )}
                    onClick={() => setActiveCreditCardIndex(activeCreditCardIndex === index ? null : index)}
                  >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        card.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(card.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      creditCardBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(creditCardBalanceData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credit Card Used Limit */}
        {showCreditCardUsedChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Limite Usado - Cartões
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={creditCardUsedChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={creditCardUsedData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance * 100), " - Limite Usado"];
                        }
                        return [formatCurrency(value), " - Limite Usado"];
                      }}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {creditCardUsedData.map((entry, index) => (
                         <Cell 
                           key={`cell-used-positive-${index}`} 
                           fill={entry.color} 
                           style={{
                             opacity: activeCreditCardUsedIndex !== null && activeCreditCardUsedIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveCreditCardUsedIndex(index)}
                           onMouseLeave={() => setActiveCreditCardUsedIndex(null)}
                           onClick={() => setActiveCreditCardUsedIndex(activeCreditCardUsedIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Limite Usado - desktop/tablet */}
              {!isMobile && creditCardUsedData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {creditCardUsedData.map((card, index) => (
                    <div 
                      key={`legend-used-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeCreditCardUsedIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeCreditCardUsedIndex !== null && activeCreditCardUsedIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveCreditCardUsedIndex(index)}
                      onMouseLeave={() => setActiveCreditCardUsedIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(card.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className="font-medium flex-shrink-0 text-destructive">
                      {formatCurrency(creditCardUsedData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Limite Usado - mobile */}
              {isMobile && creditCardUsedData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {creditCardUsedData.map((card, index) => (
                    <div 
                      key={`legend-used-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeCreditCardUsedIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeCreditCardUsedIndex !== null && activeCreditCardUsedIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveCreditCardUsedIndex(activeCreditCardUsedIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(card.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className="font-medium flex-shrink-0 text-destructive">
                      {formatCurrency(creditCardUsedData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overdraft Available - Cheque Especial */}
        {showOverdraftBalanceChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Crédito Disponível - Cheque Especial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={overdraftChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overdraftBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance * 100), "Disponível"];
                        }
                        return [formatCurrency(value), "Disponível"];
                      }}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--success))"
                     >
                       {overdraftBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-overdraft-positive-${index}`} 
                           fill={entry.balance > 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeOverdraftIndex !== null && activeOverdraftIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveOverdraftIndex(index)}
                           onMouseLeave={() => setActiveOverdraftIndex(null)}
                           onClick={() => setActiveOverdraftIndex(activeOverdraftIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                     <Bar 
                       dataKey="negativeBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {overdraftBalanceData.map((entry, index) => (
                         <Cell 
                           key={`cell-overdraft-negative-${index}`} 
                           fill={entry.balance < 0 ? entry.color : "transparent"} 
                           style={{
                             opacity: activeOverdraftIndex !== null && activeOverdraftIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveOverdraftIndex(index)}
                           onMouseLeave={() => setActiveOverdraftIndex(null)}
                           onClick={() => setActiveOverdraftIndex(activeOverdraftIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda - desktop/tablet */}
              {!isMobile && overdraftBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {overdraftBalanceData.map((acc, index) => (
                    <div 
                      key={`legend-overdraft-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeOverdraftIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeOverdraftIndex !== null && activeOverdraftIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveOverdraftIndex(index)}
                      onMouseLeave={() => setActiveOverdraftIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="truncate text-foreground">
                          {acc.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        acc.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(acc.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      overdraftBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(overdraftBalanceData.reduce((acc, curr) => acc + curr.balance, 0) * 100)}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda - mobile */}
              {isMobile && overdraftBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {overdraftBalanceData.map((acc, index) => (
                    <div 
                      key={`legend-overdraft-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeOverdraftIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeOverdraftIndex !== null && activeOverdraftIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveOverdraftIndex(activeOverdraftIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="truncate text-foreground">
                          {acc.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        acc.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(acc.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className={`font-medium flex-shrink-0 ${
                      overdraftBalanceData.reduce((acc, curr) => acc + curr.balance, 0) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(overdraftBalanceData.reduce((acc, curr) => acc + curr.balance, 0) * 100)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overdraft Used Limit - Cheque Especial */}
        {showOverdraftUsedChart && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Limite Usado - Cheque Especial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <div className="relative w-full">
                <ChartContainer
                  config={overdraftUsedChartConfig}
                  className={`${chartHeight} w-full overflow-hidden`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overdraftUsedData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 0 : 30,
                        left: isMobile ? 0 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                      width={isMobile ? 35 : 60}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance * 100), " - Limite Usado"];
                        }
                        return [formatCurrency(value), " - Limite Usado"];
                      }}
                     />
                     <Bar 
                       dataKey="positiveBalance" 
                       stackId="balance" 
                       fill="hsl(var(--destructive))"
                     >
                       {overdraftUsedData.map((entry, index) => (
                         <Cell 
                           key={`cell-overdraft-used-positive-${index}`} 
                           fill={entry.color} 
                           style={{
                             opacity: activeOverdraftUsedIndex !== null && activeOverdraftUsedIndex !== index ? 0.3 : 1,
                             transition: 'opacity 0.3s ease',
                             cursor: 'pointer'
                           }}
                           onMouseEnter={() => setActiveOverdraftUsedIndex(index)}
                           onMouseLeave={() => setActiveOverdraftUsedIndex(null)}
                           onClick={() => setActiveOverdraftUsedIndex(activeOverdraftUsedIndex === index ? null : index)}
                         />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Limite Usado - desktop/tablet */}
              {!isMobile && overdraftUsedData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {overdraftUsedData.map((acc, index) => (
                    <div 
                      key={`legend-overdraft-used-desktop-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeOverdraftUsedIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeOverdraftUsedIndex !== null && activeOverdraftUsedIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onMouseEnter={() => setActiveOverdraftUsedIndex(index)}
                      onMouseLeave={() => setActiveOverdraftUsedIndex(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="truncate text-foreground">
                          {acc.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(acc.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className="font-medium flex-shrink-0 text-destructive">
                      {formatCurrency(overdraftUsedData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Legenda de Limite Usado - mobile */}
              {isMobile && overdraftUsedData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {overdraftUsedData.map((acc, index) => (
                    <div 
                      key={`legend-overdraft-used-mobile-${index}`} 
                      className={cn(
                        "flex items-center justify-between gap-2 text-caption transition-all duration-200 cursor-pointer rounded px-1",
                        activeOverdraftUsedIndex === index ? "bg-muted/50 scale-105 font-medium" : "",
                        activeOverdraftUsedIndex !== null && activeOverdraftUsedIndex !== index ? "opacity-30" : "opacity-100"
                      )}
                      onClick={() => setActiveOverdraftUsedIndex(activeOverdraftUsedIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="truncate text-foreground">
                          {acc.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(acc.balance * 100)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-caption border-t pt-2 mt-1">
                    <span className="font-medium text-foreground pl-5">Total</span>
                    <span className="font-medium flex-shrink-0 text-destructive">
                      {formatCurrency(overdraftUsedData.reduce((acc, curr) => acc + curr.balance, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


      </div>


      {/* Expense Details Table */}
      {showExpenseChart && (
      <Card className="financial-card mt-6 sm:mt-8">
        <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
          <CardTitle className="text-headline">
            <span className="block sm:hidden">Detalhes - Despesas</span>
            <span className="hidden sm:block">Detalhes por Categoria - Despesas</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {expenseData.length === 0 ? (
            <div className="text-body text-center py-8 text-muted-foreground">
              <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-body">
                Nenhuma despesa no período selecionado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <table className="w-full min-w-max sm:min-w-0">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-caption">
                      Categoria
                    </th>
                    <th className="text-right py-2 text-caption">
                      Valor
                    </th>
                    <th className="text-right py-2 text-caption hidden sm:table-cell">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenseData.map((item) => (
                    <tr key={item.category} className="border-b last:border-b-0">
                      <td className="py-2 sm:py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-body truncate max-w-[120px] sm:max-w-none">
                            {item.category}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 font-medium text-body">
                        <div className="flex flex-col sm:block">
                          <span>{formatCurrency(item.amount * 100)}</span>
                          <span className="text-caption text-muted-foreground sm:hidden">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 text-body hidden sm:table-cell">
                        {item.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Income Details Table */}
      {showIncomeChart && (
      <Card className="financial-card mt-6 sm:mt-8">
        <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
          <CardTitle className="text-headline">
            <span className="block sm:hidden">Detalhes - Receitas</span>
            <span className="hidden sm:block">Detalhes por Categoria - Receitas</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {incomeData.length === 0 ? (
            <div className="text-body text-center py-8 text-muted-foreground">
              <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-body">
                Nenhuma receita no período selecionado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <table className="w-full min-w-max sm:min-w-0">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-caption">
                      Categoria
                    </th>
                    <th className="text-right py-2 text-caption">
                      Valor
                    </th>
                    <th className="text-right py-2 text-caption hidden sm:table-cell">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.map((item) => (
                    <tr key={item.category} className="border-b last:border-b-0">
                      <td className="py-2 sm:py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-body truncate max-w-[120px] sm:max-w-none">
                            {item.category}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 font-medium text-body">
                        <div className="flex flex-col sm:block">
                          <span>{formatCurrency(item.amount * 100)}</span>
                          <span className="text-caption text-muted-foreground sm:hidden">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 text-body hidden sm:table-cell">
                        {item.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}