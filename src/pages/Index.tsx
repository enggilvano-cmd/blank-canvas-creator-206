import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/components/Dashboard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TransactionHeader } from "@/components/transactions/TransactionHeader";
import { AccountsHeader } from "@/components/accounts/AccountsHeader";
import { CategoriesHeader } from "@/components/categories/CategoriesHeader";
import { FixedTransactionsHeader } from "@/components/fixedtransactions/FixedTransactionsHeader";
import { AnalyticsHeader } from "@/components/analytics/AnalyticsHeader";
import { AccountsPage } from "@/components/AccountsPage";
import { CreditBillsPage } from "@/components/CreditBillsPage";
import { TransactionsPage } from "@/components/TransactionsPage";
import { CategoriesPage } from "@/components/CategoriesPage";
import AnalyticsPage from "@/components/AnalyticsPage";
import SystemSettings from "@/components/SystemSettings";
import { UserManagement } from "@/components/UserManagement";
import { FixedTransactionsPage } from "@/components/FixedTransactionsPage";
import { UserProfile } from "@/components/UserProfile";
import { SettingsPage } from "@/components/SettingsPage";
import BybitPage from "@/pages/BybitPage";
import { useSettings } from "@/context/SettingsContext";
import { AddAccountModal } from "@/components/AddAccountModal";
import { AddCategoryModal } from "@/components/AddCategoryModal";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { ImportTransactionsModal } from "@/components/ImportTransactionsModal";
import { EditAccountModal } from "@/components/EditAccountModal";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { TransferModal } from "@/components/TransferModal";
import { CreditPaymentModal } from "@/components/CreditPaymentModal";
import { useOfflineAuth } from "@/hooks/useOfflineAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MigrationWarning } from "@/components/MigrationWarning";
import { Account, Transaction } from "@/types";
import { logger } from "@/lib/logger";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useTransactions } from "@/hooks/queries/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { useAccountHandlers } from "@/hooks/useAccountHandlers";
import { useTransactionHandlers, useOfflineTransactionMutations, useOfflineTransferMutations, useOfflineCreditPaymentMutations, useOfflineCategoryMutations } from "@/hooks/useTransactionHandlers";
import { TransactionScopeDialog, EditScope } from "@/components/TransactionScopeDialog";
import { MarkAsPaidModal } from "@/components/MarkAsPaidModal";
import { FormErrorBoundary } from "@/components/ui/form-error-boundary";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

// Hooks de infraestrutura offline
import { offlineDatabase } from "@/lib/offlineDatabase";
import { offlineQueue } from "@/lib/offlineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface TransactionsFilters {
  search: string;
  filterType: "all" | "income" | "expense" | "transfer";
  filterAccount: string;
  filterCategory: string;
  filterStatus: "all" | "pending" | "completed";
  filterAccountType: "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  filterIsFixed: "all" | "true" | "false";
  filterIsProvision: "all" | "true" | "false";
  filterInvoiceMonth: string; // "all" ou "YYYY-MM"
  dateFrom?: string;
  dateTo?: string;
  sortBy: "date" | "amount";
  sortOrder: "asc" | "desc";
  periodFilter: "all" | "current_month" | "month_picker" | "custom";
  selectedMonth: string;
  customStartDate?: string;
  customEndDate?: string;
}

const PlaniFlowApp = () => {
  const { user, loading: authLoading, isAdmin, isSubscriptionActive } = useOfflineAuth();
  useRealtimeSubscription();
  const { settings, updateSettings } = useSettings();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus(); // Status de conexão para decisões de UI

  // Cleanup expired provisions on mount
  useEffect(() => {
    if (user && isOnline) {
      supabase.rpc('cleanup_expired_provisions', { p_user_id: user.id })
        .then(({ error }) => {
          if (error) logger.error('Error cleaning up provisions:', error);
        });
    }
  }, [user, isOnline]);

  // Enforce subscription restrictions
  useEffect(() => {
    if (!authLoading && !isSubscriptionActive() && currentPage !== 'profile') {
      setCurrentPage('profile');
      toast({
        title: "Assinatura Expirada",
        description: "Sua assinatura expirou. Acesso restrito ao perfil.",
        variant: "destructive"
      });
    }
  }, [authLoading, isSubscriptionActive, currentPage]);

  const handleNavigate = (page: string) => {
    if (!isSubscriptionActive() && page !== 'profile') {
      toast({
        title: "Acesso Restrito",
        description: "Sua assinatura expirou. Renove para acessar esta funcionalidade.",
        variant: "destructive"
      });
      return;
    }
    setCurrentPage(page);
  };

  // Pagination state
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [transactionsPageSize, setTransactionsPageSize] = useState<number | null>(50);

  // Transaction filters state with persistence
  const [transactionsFilters, setTransactionsFilters] = usePersistedFilters<TransactionsFilters>(
    'transactions-filters',
    {
      search: "",
      filterType: "all",
      filterAccount: "all",
      filterCategory: "all",
      filterStatus: "all",
      filterAccountType: "all",
      filterIsFixed: "all",
      filterIsProvision: "all",
      filterInvoiceMonth: "all",
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: "date",
      sortOrder: "desc",
      periodFilter: "all",
      selectedMonth: new Date().toISOString(),
      customStartDate: undefined,
      customEndDate: undefined,
    }
  );

  // Helper functions para atualizar filtros
  const updateTransactionsFilter = (updates: Partial<TransactionsFilters>) => {
    setTransactionsFilters((prev) => ({ ...prev, ...updates }));
  };

  // Create individual setters for backwards compatibility
  const setTransactionsSearch = (search: string) => updateTransactionsFilter({ search });
  const setTransactionsFilterType = (filterType: typeof transactionsFilters.filterType) => updateTransactionsFilter({ filterType });
  const setTransactionsFilterAccount = (filterAccount: string) => updateTransactionsFilter({ filterAccount });
  const setTransactionsFilterCategory = (filterCategory: string) => updateTransactionsFilter({ filterCategory });
  const setTransactionsFilterStatus = (filterStatus: typeof transactionsFilters.filterStatus) => updateTransactionsFilter({ filterStatus });
  const setTransactionsFilterAccountType = (filterAccountType: typeof transactionsFilters.filterAccountType) => updateTransactionsFilter({ filterAccountType });
  const setTransactionsFilterIsFixed = (filterIsFixed: typeof transactionsFilters.filterIsFixed) => updateTransactionsFilter({ filterIsFixed });
  const setTransactionsFilterIsProvision = (filterIsProvision: typeof transactionsFilters.filterIsProvision) => updateTransactionsFilter({ filterIsProvision });
  const setTransactionsFilterInvoiceMonth = (filterInvoiceMonth: string) => updateTransactionsFilter({ filterInvoiceMonth });
  const setTransactionsDateFrom = (dateFrom: string | undefined) => updateTransactionsFilter({ dateFrom });
  const setTransactionsDateTo = (dateTo: string | undefined) => updateTransactionsFilter({ dateTo });
  const setTransactionsSortBy = (sortBy: typeof transactionsFilters.sortBy) => updateTransactionsFilter({ sortBy });
  const setTransactionsSortOrder = (sortOrder: typeof transactionsFilters.sortOrder) => updateTransactionsFilter({ sortOrder });
  const setTransactionsPeriodFilter = (periodFilter: typeof transactionsFilters.periodFilter) => updateTransactionsFilter({ periodFilter });
  const setTransactionsSelectedMonth = (date: Date) => updateTransactionsFilter({ selectedMonth: date.toISOString() });
  const setTransactionsCustomStartDate = (date: Date | undefined) => updateTransactionsFilter({ customStartDate: date?.toISOString() });
  const setTransactionsCustomEndDate = (date: Date | undefined) => updateTransactionsFilter({ customEndDate: date?.toISOString() });

  // Extract values from filters for easier access
  const transactionsSearch = transactionsFilters.search;
  const transactionsFilterType = transactionsFilters.filterType;
  const transactionsFilterAccount = transactionsFilters.filterAccount;
  const transactionsFilterCategory = transactionsFilters.filterCategory;
  const transactionsFilterStatus = transactionsFilters.filterStatus;
  const transactionsFilterAccountType = transactionsFilters.filterAccountType;
  const transactionsFilterIsFixed = transactionsFilters.filterIsFixed;
  const transactionsFilterIsProvision = transactionsFilters.filterIsProvision;
  const transactionsFilterInvoiceMonth = transactionsFilters.filterInvoiceMonth;
  const transactionsDateFrom = transactionsFilters.dateFrom;
  const transactionsDateTo = transactionsFilters.dateTo;
  const transactionsSortBy = transactionsFilters.sortBy;
  const transactionsSortOrder = transactionsFilters.sortOrder;
  const transactionsPeriodFilter = transactionsFilters.periodFilter;
  const transactionsSelectedMonth = new Date(transactionsFilters.selectedMonth);
  const transactionsCustomStartDate = transactionsFilters.customStartDate ? new Date(transactionsFilters.customStartDate) : undefined;
  const transactionsCustomEndDate = transactionsFilters.customEndDate ? new Date(transactionsFilters.customEndDate) : undefined;

  const [accountFilterType, setAccountFilterType] = useState<
    "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher"
  >("all");

  // React Query hooks - fonte única de verdade
  const { accounts, isLoading: loadingAccounts } = useAccounts();
  
  // 1. Transações para a Lista (Filtradas e Paginadas)
  const {
    transactions: filteredTransactions, 
    isLoading: loadingFilteredTransactions,
    totalCount,
    pageCount,
    addTransaction,
    editTransaction,
    deleteTransaction,
    importTransactions,
  } = useTransactions({
    page: transactionsPage,
    pageSize: transactionsPageSize,
    search: transactionsFilters.search,
    type: transactionsFilters.filterType,
    accountId: transactionsFilters.filterAccount,
    categoryId: transactionsFilters.filterCategory,
    status: transactionsFilters.filterStatus,
    accountType: transactionsFilters.filterAccountType,
    isFixed: transactionsFilters.filterIsFixed,
    isProvision: transactionsFilters.filterIsProvision,
    invoiceMonth: transactionsFilters.filterInvoiceMonth,
    dateFrom: transactionsFilters.dateFrom,
    dateTo: transactionsFilters.dateTo,
    sortBy: transactionsFilters.sortBy,
    sortOrder: transactionsFilters.sortOrder,
  });

  // 2. Transações para Dashboard e Analytics (Sem filtros de lista e sem paginação)
  // Isso garante que os gráficos mostrem todos os dados, independente dos filtros da tabela
  const {
    transactions: allTransactions,
    isLoading: loadingAllTransactions,
  } = useTransactions({
    pageSize: null, // Buscar todas para cálculos corretos
    // Sem filtros aplicados
    enabled: currentPage === 'dashboard' || currentPage === 'analytics' || currentPage === 'transactions' || currentPage === 'users' || currentPage === 'system-settings',
  });

  const { categories, loading: loadingCategories } = useCategories();

  // Computed loading state otimizado com useMemo
  const loadingData = useMemo(() => 
    authLoading || loadingAccounts || loadingFilteredTransactions || loadingAllTransactions || loadingCategories,
    [authLoading, loadingAccounts, loadingFilteredTransactions, loadingAllTransactions, loadingCategories]
  );

  // Calcular meses de fatura disponíveis a partir de allTransactions
  const availableInvoiceMonths = useMemo(() => {
    if (!allTransactions) return [];
    const months = new Set<string>();
    allTransactions.forEach(t => {
      if (t.invoice_month) {
        months.add(t.invoice_month);
      }
    });
    // Ordenar do mais recente para o mais antigo
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  // Modal states
  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [addTransactionModalOpen, setAddTransactionModalOpen] = useState(false);
  const [importTransactionsModalOpen, setImportTransactionsModalOpen] = useState(false);
  const [importAccountsModalOpen, setImportAccountsModalOpen] = useState(false);
  const [importCategoriesModalOpen, setImportCategoriesModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [importFixedTransactionsModalOpen, setImportFixedTransactionsModalOpen] = useState(false);
  const [addFixedTransactionModalOpen, setAddFixedTransactionModalOpen] = useState(false);
  const [transactionInitialType, setTransactionInitialType] = useState<"income" | "expense" | "">("");
  const [transactionInitialAccountType, setTransactionInitialAccountType] = useState<"credit" | "checking" | "">("");
  const [transactionLockType, setTransactionLockType] = useState(false);
  const [editAccountModalOpen, setEditAccountModalOpen] = useState(false);
  const [editTransactionModalOpen, setEditTransactionModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [creditPaymentModalOpen, setCreditPaymentModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [payingCreditAccount, setPayingCreditAccount] = useState<Account | null>(null);
  const [markingAsPaidTransaction, setMarkingAsPaidTransaction] = useState<Transaction | null>(null);
  const [markAsPaidScopeDialogOpen, setMarkAsPaidScopeDialogOpen] = useState(false);
  const [markAsPaidModalOpen, setMarkAsPaidModalOpen] = useState(false);
  const [markAsPaidData, setMarkAsPaidData] = useState<{
    date: Date;
    amount: number;
    accountId: string;
  } | null>(null);
  
  const [currentInvoiceValue, setCurrentInvoiceValue] = useState(0);
  const [nextInvoiceValue, setNextInvoiceValue] = useState(0);
  const [payingTotalDebt, setPayingTotalDebt] = useState(0);

  // Use hooks customizados para handlers
  const { handleEditAccount, handleDeleteAccount, handleImportAccounts } = useAccountHandlers();
  const {
    handleAddInstallmentTransactions,
    handleImportTransactions,
  } = useTransactionHandlers();
  const {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
  } = useOfflineTransactionMutations();
  const { handleTransfer } = useOfflineTransferMutations();
  const { handleCreditPayment, handleReversePayment } = useOfflineCreditPaymentMutations();
  const { handleAddCategory } = useOfflineCategoryMutations();

  // --- LÓGICA DE LIMPEZA DE DADOS OFFLINE-FIRST ---
  const handleClearAllData = async () => {
    if (!user) return;
    
    if (!window.confirm("ATENÇÃO: Isso apagará TODOS os dados (transações, contas, categorias). Esta ação é irreversível.")) {
      return;
    }

    try {
      // 1. Limpeza Local Imediata (Dexie)
      await offlineDatabase.clearAll();
      
      // 2. Limpeza de Cache do React Query para atualizar UI
      queryClient.removeQueries();
      
      // 3. Gerenciar dados remotos
      if (isOnline) {
        await supabase.from("transactions").delete().eq("user_id", user.id);
        await supabase.from("accounts").delete().eq("user_id", user.id);
        await supabase.from("categories").delete().eq("user_id", user.id);
        
        toast({
          title: "Dados limpos",
          description: "Todos os dados foram removidos local e remotamente.",
        });
      } else {
        // Modo Offline: Agenda a limpeza
        await offlineQueue.enqueue({
            type: 'clear_all_data',
            data: { timestamp: Date.now() }
        });
        
        toast({
          title: "Limpeza Local Concluída",
          description: "Dados locais removidos. A limpeza no servidor será sincronizada quando houver conexão.",
          variant: "default",
        });
      }

      // 4. Invalidação forçada para garantir UI vazia
      await queryClient.invalidateQueries();
      
    } catch (error) {
      logger.error("Error clearing data:", error);
      toast({
        title: "Erro",
        description: "Erro ao processar limpeza de dados",
        variant: "destructive",
      });
    }
  };
  // ------------------------------------------------

  const openEditAccount = (account: Account) => {
    setEditingAccount(account);
    setEditAccountModalOpen(true);
  };

  const openEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditTransactionModalOpen(true);
  };

  const openCreditPayment = (
    account: Account,
    currentBill: number,
    nextBill: number,
    totalBalance: number
  ) => {
    setPayingCreditAccount(account);
    setCurrentInvoiceValue(currentBill);
    setNextInvoiceValue(nextBill);
    setPayingTotalDebt(totalBalance);
    setCreditPaymentModalOpen(true);
  };

  const handleMarkAsPaid = async (transaction: Transaction) => {
    setMarkingAsPaidTransaction(transaction);
    setMarkAsPaidModalOpen(true);
  };

  const handleMarkAsPaidConfirm = async (
    _transactionId: string,
    date: Date,
    amount: number,
    accountId: string
  ) => {
    const transaction = markingAsPaidTransaction;
    if (!transaction) return;
    await processMarkAsPaid(transaction, 'current', { date, amount, accountId });
  };

  const processMarkAsPaid = async (
    transaction: Transaction,
    scope: 'current' | 'current-and-remaining' | 'all',
    data?: { date: Date; amount: number; accountId: string }
  ) => {
    try {
      const updatedData = data || markAsPaidData;
      if (!updatedData) return;

      await handleEditTransaction(
        {
          ...transaction,
          status: 'completed',
          date: updatedData.date.toISOString().split('T')[0],
          amount: updatedData.amount,
          account_id: updatedData.accountId,
        },
        scope
      );
      
      toast({
        title: "Sucesso",
        description: scope === 'current' 
          ? "Transação marcada como paga" 
          : scope === 'all' 
          ? "Todas as parcelas marcadas como pagas"
          : "Parcelas selecionadas marcadas como pagas",
      });
      
      setMarkAsPaidModalOpen(false);
      setMarkAsPaidScopeDialogOpen(false);
      setMarkingAsPaidTransaction(null);
      setMarkAsPaidData(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao marcar transação como paga",
        variant: "destructive",
      });
    }
  };

  const analyticsTransactions = useMemo(() => 
    allTransactions.map(t => ({ ...t, category: t.category_id || "" })),
    [allTransactions]
  );

  const renderDashboard = () => (
    <Dashboard
      accounts={accounts}
      transactions={allTransactions}
      categories={categories}
      onTransfer={() => setTransferModalOpen(true)}
      onAddAccount={() => setAddAccountModalOpen(true)}
      onAddTransaction={() => {
        setTransactionInitialType("");
        setTransactionInitialAccountType("");
        setTransactionLockType(false);
        setAddTransactionModalOpen(true);
      }}
      onAddExpense={() => {
        setTransactionInitialType("expense");
        setTransactionInitialAccountType("checking");
        setTransactionLockType(true);
        setAddTransactionModalOpen(true);
      }}
      onAddIncome={() => {
        setTransactionInitialType("income");
        setTransactionInitialAccountType("checking");
        setTransactionLockType(true);
        setAddTransactionModalOpen(true);
      }}
      onAddCreditExpense={() => {
        setTransactionInitialType("expense");
        setTransactionInitialAccountType("credit");
        setTransactionLockType(false);
        setAddTransactionModalOpen(true);
      }}
      onNavigateToAccounts={(filterType) => {
        if (filterType) {
          setAccountFilterType(filterType as "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher");
        } else {
          setAccountFilterType("all");
        }
        handleNavigate("accounts");
      }}
      onNavigateToTransactions={(
        filterType,
        filterStatus,
        dateFilter,
        filterAccountType,
        selectedMonth,
        customStartDate,
        customEndDate
      ) => {
        if (filterType) setTransactionsFilterType(filterType);
        if (filterStatus) setTransactionsFilterStatus(filterStatus);
        if (filterAccountType) setTransactionsFilterAccountType(filterAccountType);
        
        setTransactionsPeriodFilter(dateFilter || 'all');
        
        if (dateFilter === 'current_month') {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          setTransactionsDateFrom(startOfMonth.toISOString().split('T')[0]);
          setTransactionsDateTo(endOfMonth.toISOString().split('T')[0]);
        } else if (dateFilter === 'month_picker' && selectedMonth) {
          setTransactionsSelectedMonth(selectedMonth);
          const startOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
          const endOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
          setTransactionsDateFrom(startOfMonth.toISOString().split('T')[0]);
          setTransactionsDateTo(endOfMonth.toISOString().split('T')[0]);
        } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
          setTransactionsCustomStartDate(customStartDate);
          setTransactionsCustomEndDate(customEndDate);
          setTransactionsDateFrom(customStartDate.toISOString().split('T')[0]);
          setTransactionsDateTo(customEndDate.toISOString().split('T')[0]);
        } else if (dateFilter === 'all') {
          setTransactionsDateFrom(undefined);
          setTransactionsDateTo(undefined);
        }
        
        handleNavigate("transactions");
      }}
    />
  );

  const renderCurrentPage = () => {
    switch (currentPage) {
      case "accounts":
        return (
          <AccountsPage
            onAddAccount={() => setAddAccountModalOpen(true)}
            onEditAccount={openEditAccount}
            onDeleteAccount={handleDeleteAccount}
            onPayCreditCard={(account) => openCreditPayment(account, 0, 0, account.balance < 0 ? Math.abs(account.balance) : 0)} 
            onTransfer={() => setTransferModalOpen(true)}
            onImportAccounts={handleImportAccounts}
            initialFilterType={accountFilterType}
            importModalOpen={importAccountsModalOpen}
            onImportModalOpenChange={setImportAccountsModalOpen}
          />
        );
      case "credit-bills":
        return <CreditBillsPage 
                  onPayCreditCard={openCreditPayment} 
                  onReversePayment={handleReversePayment} 
               />;
      case "transactions":
        return (
          <TransactionsPage
            transactions={filteredTransactions}
            accounts={accounts}
            categories={categories}
            onAddTransaction={() => setAddTransactionModalOpen(true)}
            onEditTransaction={openEditTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onImportTransactions={handleImportTransactions}
            onMarkAsPaid={handleMarkAsPaid}
            totalCount={totalCount}
            pageCount={pageCount}
            currentPage={transactionsPage}
            pageSize={transactionsPageSize}
            onPageChange={setTransactionsPage}
            onPageSizeChange={setTransactionsPageSize}
            search={transactionsSearch}
            onSearchChange={setTransactionsSearch}
            filterType={transactionsFilterType}
            onFilterTypeChange={setTransactionsFilterType}
            filterAccount={transactionsFilterAccount}
            onFilterAccountChange={setTransactionsFilterAccount}
            filterCategory={transactionsFilterCategory}
            onFilterCategoryChange={setTransactionsFilterCategory}
            filterStatus={transactionsFilterStatus}
            onFilterStatusChange={setTransactionsFilterStatus}
            filterAccountType={transactionsFilterAccountType}
            onFilterAccountTypeChange={(value: string) => setTransactionsFilterAccountType(value as "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher")}
            filterIsFixed={transactionsFilterIsFixed}
            onFilterIsFixedChange={(value: string) => setTransactionsFilterIsFixed(value as "all" | "true" | "false")}
            filterIsProvision={transactionsFilterIsProvision}
            onFilterIsProvisionChange={(value: string) => setTransactionsFilterIsProvision(value as "all" | "true" | "false")}
            filterInvoiceMonth={transactionsFilterInvoiceMonth}
            onFilterInvoiceMonthChange={setTransactionsFilterInvoiceMonth}
            dateFrom={transactionsDateFrom}
            dateTo={transactionsDateTo}
            onDateFromChange={setTransactionsDateFrom}
            onDateToChange={setTransactionsDateTo}
            sortBy={transactionsSortBy}
            onSortByChange={setTransactionsSortBy}
            sortOrder={transactionsSortOrder}
            onSortOrderChange={setTransactionsSortOrder}
            isLoading={loadingFilteredTransactions}
            periodFilter={transactionsPeriodFilter}
            onPeriodFilterChange={setTransactionsPeriodFilter}
            selectedMonth={transactionsSelectedMonth}
            onSelectedMonthChange={setTransactionsSelectedMonth}
            customStartDate={transactionsCustomStartDate}
            onCustomStartDateChange={setTransactionsCustomStartDate}
            customEndDate={transactionsCustomEndDate}
            onCustomEndDateChange={setTransactionsCustomEndDate}
            allTransactions={allTransactions}
            availableInvoiceMonths={availableInvoiceMonths}
          />
        );
      case "fixed":
        return <FixedTransactionsPage 
          importModalOpen={importFixedTransactionsModalOpen}
          onImportModalOpenChange={setImportFixedTransactionsModalOpen}
          addModalOpen={addFixedTransactionModalOpen}
          onAddModalOpenChange={setAddFixedTransactionModalOpen}
        />;
      case "categories":
        return <CategoriesPage 
          importModalOpen={importCategoriesModalOpen}
          onImportModalOpenChange={setImportCategoriesModalOpen}
          initialCategories={categories}
        />;
      case "analytics":
        return (
          <AnalyticsPage 
            transactions={analyticsTransactions} 
            accounts={accounts}
            initialDateFilter={transactionsPeriodFilter}
            initialSelectedMonth={transactionsSelectedMonth}
            initialCustomStartDate={transactionsCustomStartDate}
            initialCustomEndDate={transactionsCustomEndDate}
          />
        );
      case "users":
        return isAdmin() ? <UserManagement /> : renderDashboard();
      case "system-settings":
        return isAdmin() ? <SystemSettings /> : renderDashboard();
      case "profile":
        return <UserProfile />;
      case "settings":
        return <SettingsPage 
          settings={settings}
          onUpdateSettings={updateSettings}
          onClearAllData={handleClearAllData}
        />;
      case "bybit":
        return <BybitPage />;
      default:
        return renderDashboard();
    }
  };


  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      onClearAllData={handleClearAllData}
      loading={loadingData}
      pageHeaderButtons={
        currentPage === 'dashboard' ? (
          <DashboardHeader
            onTransfer={() => setTransferModalOpen(true)}
            onAddExpense={() => {
              setTransactionInitialType("expense");
              setTransactionInitialAccountType("checking");
              setTransactionLockType(true);
              setAddTransactionModalOpen(true);
            }}
            onAddIncome={() => {
              setTransactionInitialType("income");
              setTransactionInitialAccountType("checking");
              setTransactionLockType(true);
              setAddTransactionModalOpen(true);
            }}
            onAddCreditExpense={() => {
              setTransactionInitialType("expense");
              setTransactionInitialAccountType("credit");
              setTransactionLockType(false);
              setAddTransactionModalOpen(true);
            }}
            isHeaderVersion={true}
          />
        ) : currentPage === 'transactions' ? (
          <TransactionHeader
            onAddTransaction={() => {
              setTransactionInitialType("expense");
              setTransactionInitialAccountType("checking");
              setTransactionLockType(true);
              setAddTransactionModalOpen(true);
            }}
            onExport={() => {
              const handleExport = async () => {
                try {
                  const { exportTransactionsToExcel } = await import('@/lib/exportUtils');
                  const exportData = filteredTransactions.map(t => ({
                    ...t,
                    date: typeof t.date === 'string' ? t.date : t.date.toISOString(),
                  })) as Array<{ id: string; description: string; amount: number; date: string; type: 'income' | 'expense' | 'transfer'; status: 'pending' | 'completed'; account_id: string; category_id?: string | null; to_account_id?: string | null; installments?: number | null; current_installment?: number | null; invoice_month?: string | null; is_recurring?: boolean | null; is_fixed?: boolean | null; created_at?: string }>;
                  await exportTransactionsToExcel(exportData, accounts, categories);
                  
                  toast({
                    title: "Sucesso",
                    description: `${filteredTransactions.length} transação${filteredTransactions.length !== 1 ? 'ões' : ''} exportada${filteredTransactions.length !== 1 ? 's' : ''} com sucesso`,
                  });
                } catch (error) {
                  logger.error('Erro ao exportar:', error);
                  toast({
                    title: "Erro",
                    description: "Erro ao exportar transações",
                    variant: "destructive",
                  });
                }
              };
              handleExport();
            }}
            onImport={() => setImportTransactionsModalOpen(true)}
            isHeaderVersion={true}
          />
        ) : currentPage === 'accounts' ? (
          <AccountsHeader
            onAddAccount={() => setAddAccountModalOpen(true)}
            onTransfer={() => setTransferModalOpen(true)}
            onImport={() => setImportAccountsModalOpen(true)}
            isHeaderVersion={true}
          />
        ) : currentPage === 'categories' ? (
          <CategoriesHeader
            onAddCategory={() => setAddCategoryModalOpen(true)}
            onImport={() => setImportCategoriesModalOpen(true)}
            isHeaderVersion={true}
            categories={categories}
          />
        ) : currentPage === 'fixed' ? (
          <FixedTransactionsHeader
            onAddFixedTransaction={() => setAddFixedTransactionModalOpen(true)}
            onImport={() => setImportFixedTransactionsModalOpen(true)}
            transactions={allTransactions}
            accounts={accounts}
            isHeaderVersion={true}
          />
        ) : currentPage === 'analytics' ? (
          <AnalyticsHeader
            onExportPDF={() => {
              // Será chamado da página
              const button = document.querySelector('[data-action="export-pdf"]') as HTMLButtonElement;
              button?.click();
            }}
          />
        ) : null
      }
      dashboardHeaderCallbacks={{
        onTransfer: () => setTransferModalOpen(true),
        onAddExpense: () => {
          setTransactionInitialType("expense");
          setTransactionInitialAccountType("checking");
          setTransactionLockType(true);
          setAddTransactionModalOpen(true);
        },
        onAddIncome: () => {
          setTransactionInitialType("income");
          setTransactionInitialAccountType("checking");
          setTransactionLockType(true);
          setAddTransactionModalOpen(true);
        },
        onAddCreditExpense: () => {
          setTransactionInitialType("expense");
          setTransactionInitialAccountType("credit");
          setTransactionLockType(false);
          setAddTransactionModalOpen(true);
        },
      }}
    >
      <MigrationWarning />

      {renderCurrentPage()}

      {/* Modals com Error Boundaries */}
      <FormErrorBoundary fallbackMessage="Erro ao abrir formulário de conta">
        <AddAccountModal
          open={addAccountModalOpen}
          onOpenChange={setAddAccountModalOpen}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir formulário de categoria">
        <AddCategoryModal
          open={addCategoryModalOpen}
          onOpenChange={setAddCategoryModalOpen}
          onAddCategory={handleAddCategory}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir formulário de transação">
        <AddTransactionModal
          open={addTransactionModalOpen}
          onOpenChange={setAddTransactionModalOpen}
          onAddTransaction={handleAddTransaction}
          onAddInstallmentTransactions={handleAddInstallmentTransactions}
          accounts={accounts}
          initialType={transactionInitialType}
          initialAccountType={transactionInitialAccountType}
          lockType={transactionLockType}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir importação de transações">
        <ImportTransactionsModal
          open={importTransactionsModalOpen}
          onOpenChange={setImportTransactionsModalOpen}
          accounts={accounts}
          transactions={allTransactions || []}
          onImportTransactions={handleImportTransactions}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir edição de conta">
        <EditAccountModal
          open={editAccountModalOpen}
          onOpenChange={setEditAccountModalOpen}
          account={editingAccount}
          onEditAccount={handleEditAccount}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir edição de transação">
        <EditTransactionModal
          open={editTransactionModalOpen}
          onOpenChange={setEditTransactionModalOpen}
          transaction={editingTransaction}
          onEditTransaction={handleEditTransaction}
          accounts={accounts}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir transferência">
        <TransferModal
          open={transferModalOpen}
          onOpenChange={setTransferModalOpen}
          onTransfer={async (fromAccountId, toAccountId, amountInCents, date) => {
            await handleTransfer(fromAccountId, toAccountId, amountInCents, date);
            const fromAccount = accounts.find(acc => acc.id === fromAccountId)!;
            const toAccount = accounts.find(acc => acc.id === toAccountId)!;
            return { fromAccount, toAccount };
          }}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir pagamento de fatura">
        <CreditPaymentModal
          open={creditPaymentModalOpen}
          onOpenChange={setCreditPaymentModalOpen}
          onPayment={async (params) => {
          const result = await handleCreditPayment(params);
          return { updatedCreditAccount: result.creditAccount, updatedDebitAccount: result.bankAccount };
        }}
        creditAccount={payingCreditAccount}
        invoiceValueInCents={currentInvoiceValue}
        nextInvoiceValueInCents={nextInvoiceValue}
        totalDebtInCents={payingTotalDebt}
        />
      </FormErrorBoundary>

      <FormErrorBoundary fallbackMessage="Erro ao abrir confirmação">
        <MarkAsPaidModal
          open={markAsPaidModalOpen}
          onOpenChange={setMarkAsPaidModalOpen}
          transaction={markingAsPaidTransaction}
          accounts={accounts}
          onConfirm={handleMarkAsPaidConfirm}
        />
      </FormErrorBoundary>

      <TransactionScopeDialog
        open={markAsPaidScopeDialogOpen}
        onOpenChange={setMarkAsPaidScopeDialogOpen}
        onScopeSelected={(scope: EditScope) => {
          if (markingAsPaidTransaction) {
            processMarkAsPaid(markingAsPaidTransaction, scope);
          }
        }}
        currentInstallment={markingAsPaidTransaction?.current_installment || 1}
        totalInstallments={markingAsPaidTransaction?.installments || 1}
        isRecurring={Boolean(markingAsPaidTransaction?.is_fixed)}
        mode="edit"
      />
    </Layout>
  );
};

export default PlaniFlowApp;