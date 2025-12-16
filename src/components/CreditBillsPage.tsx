import { useState, useMemo } from "react";
import { useSettings } from "@/context/SettingsContext";
import { logger } from "@/lib/logger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  CalendarDays,
  TrendingUp,
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTransactions } from "@/hooks/queries/useTransactions";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { AppTransaction, Account } from "@/types";
import { calculateBillDetails, calculateInvoiceMonthByDue } from "@/lib/dateUtils";
import { CreditCardBillCard } from "@/components/CreditCardBillCard";
import { CreditBillDetailsModal } from "@/components/CreditBillDetailsModal";
import { cn as _cn } from "@/lib/utils";
import { format, addMonths, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditBillFilterDialog } from "@/components/creditbills/CreditBillFilterDialog";
import { CreditBillFilterChips } from "@/components/creditbills/CreditBillFilterChips";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";

interface CreditBillsFilters {
  searchTerm: string;
  selectedAccountId: string;
  selectedMonthOffset: number;
  filterBillStatus: "all" | "open" | "closed";
  filterPaymentStatus: "all" | "paid" | "pending";
  hideZeroBalance: boolean;
}

interface CreditBillsPageProps {
  onPayCreditCard: (
    account: Account,
    currentBillAmount: number,
    nextBillAmount: number,
    totalBalance: number,
    invoiceMonth?: string
  ) => void;
  // Prop para o estorno (será adicionada no Index.tsx)
  onReversePayment: (paymentsToReverse: AppTransaction[]) => void;
}

export function CreditBillsPage({ onPayCreditCard, onReversePayment }: CreditBillsPageProps) {
  const { accounts: allAccounts = [] } = useAccounts();
  // ✅ P0-4 FIX: Usar pageSize: null para carregar todas sem limite artificial
  const { transactions: allTransactions = [] } = useTransactions({ 
    page: 0, 
    pageSize: null, // Carrega todas as transações de cartão (sem limite)
    type: 'all',
    accountType: 'credit'
  });
  const { settings } = useSettings();
  
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<CreditBillsFilters>(
    'credit-bills-filters',
    {
      searchTerm: "",
      selectedAccountId: "all",
      selectedMonthOffset: 0,
      filterBillStatus: "all",
      filterPaymentStatus: "all",
      hideZeroBalance: false,
    }
  );

  // Extract values for easier access
  const searchTerm = filters.searchTerm;
  const selectedAccountId = filters.selectedAccountId;
  const selectedMonthOffset = filters.selectedMonthOffset;
  const filterBillStatus = filters.filterBillStatus;
  const filterPaymentStatus = filters.filterPaymentStatus;
  const hideZeroBalance = filters.hideZeroBalance;

  // Setters
  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setSelectedAccountId = (value: string) => setFilters((prev) => ({ ...prev, selectedAccountId: value }));
  const setSelectedMonthOffset = (value: number) => setFilters((prev) => ({ ...prev, selectedMonthOffset: value }));
  const setFilterBillStatus = (value: typeof filters.filterBillStatus) => setFilters((prev) => ({ ...prev, filterBillStatus: value }));
  const setFilterPaymentStatus = (value: typeof filters.filterPaymentStatus) => setFilters((prev) => ({ ...prev, filterPaymentStatus: value }));
  const setHideZeroBalance = (value: boolean) => setFilters((prev) => ({ ...prev, hideZeroBalance: value }));

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [selectedBillForDetails, setSelectedBillForDetails] = useState<{
    account: Account;
    transactions: AppTransaction[];
    billDetails: ReturnType<typeof calculateBillDetails>;
  } | null>(null);

  // Helper para formatar moeda
  const formatCents = (valueInCents: number) => {
    return new Intl.NumberFormat(settings.language === 'pt-BR' ? 'pt-BR' : settings.language === 'es-ES' ? 'es-ES' : 'en-US', {
      style: "currency",
      currency: settings.currency,
    }).format(valueInCents / 100);
  };

  const creditAccounts = useMemo(() => {
    return allAccounts
      .filter((acc) => acc.type === "credit")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAccounts]);

  const filteredCreditAccounts = useMemo(() => {
    return creditAccounts.filter((account) => {
      const matchesSearch = account.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesId =
        selectedAccountId === "all" || account.id === selectedAccountId;
      return matchesSearch && matchesId;
    });
  }, [creditAccounts, searchTerm, selectedAccountId]);

  // Calcula a data base para o mês selecionado (sempre navegação por mês)
  const selectedMonthDate = useMemo(() => {
    return addMonths(new Date(), selectedMonthOffset);
  }, [selectedMonthOffset]);

  // Generate filter chips
  const filterChips = useMemo(() => {
    const chips = [];

    // Account filter
    if (selectedAccountId !== "all") {
      const account = creditAccounts.find((a) => a.id === selectedAccountId);
      if (account) {
        chips.push({
          id: "account",
          label: `Cartão: ${account.name}`,
          value: selectedAccountId,
          color: account.color,
          onRemove: () => setSelectedAccountId("all"),
        });
      }
    }

    // Bill status filter
    if (filterBillStatus !== "all") {
      const billStatusLabels = {
        open: "Aberta",
        closed: "Fechada",
      };
      chips.push({
        id: "billStatus",
        label: `Status: ${billStatusLabels[filterBillStatus as keyof typeof billStatusLabels]}`,
        value: filterBillStatus,
        onRemove: () => setFilterBillStatus("all"),
      });
    }

    // Payment status filter
    if (filterPaymentStatus !== "all") {
      const paymentStatusLabels = {
        paid: "Pago",
        pending: "Pendente",
      };
      chips.push({
        id: "paymentStatus",
        label: `Pagamento: ${paymentStatusLabels[filterPaymentStatus as keyof typeof paymentStatusLabels]}`,
        value: filterPaymentStatus,
        onRemove: () => setFilterPaymentStatus("all"),
      });
    }

    // Hide zero balance filter
    if (hideZeroBalance) {
      chips.push({
        id: "hideZero",
        label: "Ocultar Zeradas",
        value: "hideZero",
        onRemove: () => setHideZeroBalance(false),
      });
    }

    return chips;
  }, [
    selectedAccountId,
    filterBillStatus,
    filterPaymentStatus,
    hideZeroBalance,
    creditAccounts,
    setSelectedAccountId,
    setFilterBillStatus,
    setFilterPaymentStatus,
    setHideZeroBalance,
  ]);

  const clearAllFilters = () => {
    setSelectedAccountId("all");
    setFilterBillStatus("all");
    setFilterPaymentStatus("all");
    setHideZeroBalance(false);
  };

  // Memo para calcular os detalhes da fatura do mês selecionado (alinhado ao mês exibido)
  const allBillDetails = useMemo(() => {
    logger.debug('Recalculando faturas...', { accounts: filteredCreditAccounts.length, transactions: allTransactions.length });

    return filteredCreditAccounts.map((account) => {
      const accountTransactions = allTransactions
        .filter((t) => t.account_id === account.id)
        .map((t) => ({
          ...t,
          date:
            typeof t.date === "string"
              ? new Date(t.date + "T00:00:00")
              : t.date,
        })) as AppTransaction[];

      // Ajuste do offset para alinhar com o Mês de Vencimento (Invoice Month)
      // Se due_date < closing_date, o vencimento é no mês seguinte ao fechamento.
      // Para exibir a fatura com vencimento em X, precisamos calcular com base no fechamento em X-1.
      let adjustedOffset = selectedMonthOffset;
      if (account.due_date && account.closing_date && account.due_date < account.closing_date) {
        adjustedOffset -= 1;
      }

      // Base (limite, saldo total, meses de referência)
      const base = calculateBillDetails(
        accountTransactions,
        account,
        adjustedOffset
      );

      // Usar os valores calculados pela função base (que já considera invoice_month_overridden)
      return {
        account,
        ...base,
      };
    });
  }, [
    filteredCreditAccounts,
    allTransactions,
    selectedMonthDate,
    selectedMonthOffset,
  ]);

  // Memo para aplicar os filtros de status
  const billDetails = useMemo(() => {
    return allBillDetails.filter((details) => {
      // Calcula se a fatura está fechada baseado no mês da fatura (não no mês selecionado)
      // Ex: Se estamos vendo a fatura de nov/2025 e hoje é dez/2025, precisa verificar se 08/nov já passou
      const targetMonth = details.currentInvoiceMonth || format(selectedMonthDate, 'yyyy-MM'); // Ex: "2025-11"
      const [year, month] = targetMonth.split('-').map(Number);
      
      const closingDate = details.account.closing_date 
        ? new Date(year, month - 1, details.account.closing_date) 
        : new Date(year, month - 1, 1);
      
      const isClosed = isPast(closingDate);

      // Filtro de status da fatura (aberta/fechada)
      if (filterBillStatus === "open" && isClosed) return false;
      if (filterBillStatus === "closed" && !isClosed) return false;

      // ✅ P0-3 FIX: Calcula se está paga sem margem arbitrária
      const paidAmount = details.paymentTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const amountDue = Math.max(0, details.currentBillAmount);
      // Uma fatura está "Paga" se:
      // 1. Não há valor a pagar (amountDue <= 0) - conta tem crédito
      // 2. OU o valor pago é igual ou maior que o valor devido (sem margem arbitrária)
      const isPaid = amountDue <= 0 || paidAmount >= amountDue;

      logger.debug("[CreditBillsPage] Status check", {
        account: details.account.name,
        targetMonth,
        closingDate: format(closingDate, 'dd/MM/yyyy'),
        isClosed,
        currentBillAmount: details.currentBillAmount,
        paidAmount,
        amountDue,
        isPaid,
      });

      // Filtro de status de pagamento
      if (filterPaymentStatus === "paid" && !isPaid) return false;
      if (filterPaymentStatus === "pending" && isPaid) return false;

      // Filtro de saldo zerado
      if (hideZeroBalance && details.currentBillAmount === 0) return false;

      return true;
    });
  }, [allBillDetails, filterBillStatus, filterPaymentStatus, hideZeroBalance, selectedMonthDate]);

  // Memo para os TOTAIS (baseado nos cartões filtrados)
  const totalSummary = useMemo(() => {
    return billDetails.reduce(
      (acc, details) => {
        acc.currentBill += details.currentBillAmount;
        acc.nextBill += details.nextBillAmount;
        acc.availableLimit += details.availableLimit;
        // ✅ P0-2 FIX: Tratamento correto quando limit_amount é null
        const limitAmount = details.account.limit_amount ?? 0;
        // Se availableLimit for negativo, o limite usado é o valor absoluto
        // Se availableLimit for positivo, o limite usado é a diferença
        const usedLimit = limitAmount > 0 
          ? Math.max(0, limitAmount - details.availableLimit)
          : Math.abs(Math.min(0, details.availableLimit));
        acc.usedLimit += usedLimit;
        return acc;
      },
      { currentBill: 0, nextBill: 0, availableLimit: 0, usedLimit: 0 }
    );
  }, [billDetails]);

  // Mês de fatura selecionado (baseado no offset de navegação do usuário)
  // BUGFIX: Não usar billDetails[0] pois cartões podem ter fechamentos diferentes
  // e portanto meses de fatura diferentes. O label deve refletir o mês que o usuário
  // está navegando, não a fatura de um cartão específico.
  const selectedInvoiceMonthDate = useMemo(() => {
    return selectedMonthDate;
  }, [selectedMonthDate]);

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 -mt-[60px] lg:mt-0">
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-caption font-medium">
                  Fatura Atual
                </p>
                <div className="balance-text">
                  {formatCents(totalSummary.currentBill * 100)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <CalendarDays className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-caption font-medium">
                  Próxima Fatura
                </p>
                <div className="balance-text balance-warning">
                  {formatCents(totalSummary.nextBill * 100)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-caption font-medium">
                  Limite Usado
                </p>
                <div className="balance-text balance-negative">
                  {formatCents(totalSummary.usedLimit * 100)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-caption font-medium">
                  Limite Disponível
                </p>
                <div className="balance-text balance-positive">
                  {formatCents(totalSummary.availableLimit)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4">
            {/* Filter button and active chips */}
            <div className="flex flex-wrap items-center gap-3">
              <CreditBillFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                selectedAccountId={selectedAccountId}
                onAccountChange={setSelectedAccountId}
                filterBillStatus={filterBillStatus}
                onBillStatusChange={(value) => setFilterBillStatus(value as "all" | "open" | "closed")}
                filterPaymentStatus={filterPaymentStatus}
                onPaymentStatusChange={(value) => setFilterPaymentStatus(value as "all" | "paid" | "pending")}
                hideZeroBalance={hideZeroBalance}
                onHideZeroBalanceChange={setHideZeroBalance}
                creditAccounts={creditAccounts}
                activeFiltersCount={filterChips.length}
              />
              
              <CreditBillFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search and Period Navigation */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cartões..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Period Navigation */}
              <div className="flex items-center gap-2 px-3 border border-input rounded-md bg-background min-w-[220px]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMonthOffset(selectedMonthOffset - 1)}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-sm font-medium">
                  {format(selectedInvoiceMonthDate, "MMM/yyyy", { locale: ptBR })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMonthOffset(selectedMonthOffset + 1)}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bills Grid */}
      {billDetails.length === 0 ? (
        <div className="col-span-full text-center py-12">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-headline font-semibold mb-2">Nenhuma fatura encontrada</h3>
          <p className="text-body text-muted-foreground mb-4">
            {searchTerm || Object.values(filters).some(f => f !== 'all' && f !== false && f !== '' && f !== 0)
              ? "Nenhum resultado encontrado"
              : "Adicione sua primeira conta de cartão de crédito para começar"
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 -mt-[60px] lg:mt-0">
          {billDetails.map((details) => {
            const accountTransactions = allTransactions.filter(
              (t) => t.account_id === details.account.id
            ).map(t => ({
              ...t,
              date: typeof t.date === 'string' ? new Date(t.date + 'T00:00:00') : t.date
            })) as AppTransaction[];

            // Calcula a dívida total real (soma das faturas atual e próxima)
            const totalDebt = Math.max(0, details.currentBillAmount) + Math.max(0, details.nextBillAmount);
            
            return (
              <CreditCardBillCard
                key={details.account.id}
                account={details.account}
                billDetails={details}
                selectedMonth={selectedMonthDate}
                onPayBill={() =>
                  onPayCreditCard(
                    details.account,
                    details.currentBillAmount,
                    details.nextBillAmount,
                    totalDebt, // Passa a dívida total correta (soma das faturas)
                    details.currentInvoiceMonth // Passa o mês da fatura
                  )
                }
                onReversePayment={() => onReversePayment(details.paymentTransactions)}
                onViewDetails={() => {
                  // Filtrar transações apenas da fatura corrente calculada (YYYY-MM)
                  const currentMonth = details.currentInvoiceMonth || '';
                  const filtered = accountTransactions.filter((t) => {
                    // APENAS transações concluídas devem aparecer nos detalhes
                    if (t.status !== 'completed') return false;
                    
                    const tDate = typeof t.date === 'string' ? new Date(t.date) : t.date;
                    if (!tDate || isNaN(tDate.getTime())) return false;
                    const eff = (t.invoice_month_overridden && t.invoice_month)
                      ? t.invoice_month
                      : (details.account.closing_date
                          ? calculateInvoiceMonthByDue(
                              tDate,
                              details.account.closing_date,
                              details.account.due_date || 1
                            )
                          : format(tDate, 'yyyy-MM'));
                    return t.type === 'expense' && eff === currentMonth;
                  });

                  setSelectedBillForDetails({
                    account: details.account,
                    transactions: filtered.map(t => ({
                      ...t,
                      date: typeof t.date === 'string' ? new Date(t.date + 'T00:00:00') : t.date
                    })) as AppTransaction[],
                    billDetails: details,
                  });
                }}
              />
            );
          })}
        </div>
      )}

      {/* Modal de Detalhes da Fatura */}
      {selectedBillForDetails && (
        <CreditBillDetailsModal
          bill={{
            id: selectedBillForDetails.account.id,
            account_id: selectedBillForDetails.account.id,
            billing_cycle: selectedBillForDetails.billDetails.currentInvoiceMonth || format(selectedMonthDate, "yyyy-MM"),
            due_date: (() => {
              // Calcular a data de vencimento correta baseada no mês da fatura
              const invoiceMonth = selectedBillForDetails.billDetails.currentInvoiceMonth || format(selectedMonthDate, "yyyy-MM");
              const [year, month] = invoiceMonth.split('-').map(Number);
              return new Date(year, month - 1, selectedBillForDetails.account.due_date || 1);
            })(),
            closing_date: (() => {
              // Calcular a data de fechamento correta baseada no mês da fatura
              const invoiceMonth = selectedBillForDetails.billDetails.currentInvoiceMonth || format(selectedMonthDate, "yyyy-MM");
              const [year, month] = invoiceMonth.split('-').map(Number);
              return new Date(year, month - 1, selectedBillForDetails.account.closing_date || 1);
            })(),
            total_amount: selectedBillForDetails.billDetails.currentBillAmount,
            paid_amount: selectedBillForDetails.billDetails.paymentTransactions.reduce(
              (sum, t) => sum + Math.abs(t.amount),
              0
            ),
            status: (() => {
              // Recalcular status correto baseado na data de fechamento do mês da fatura
              const invoiceMonth = selectedBillForDetails.billDetails.currentInvoiceMonth || format(selectedMonthDate, "yyyy-MM");
              const [year, month] = invoiceMonth.split('-').map(Number);
              const closingDateOfBill = new Date(year, month - 1, selectedBillForDetails.account.closing_date || 1);
              const isClosed = isPast(closingDateOfBill);
              
              const due = Math.max(0, selectedBillForDetails.billDetails.currentBillAmount);
              const paid = selectedBillForDetails.billDetails.paymentTransactions.reduce((s, t) => s + Math.abs(t.amount), 0);
              
              // Pago se não há valor a pagar OU se está fechada e foi paga
              return due <= 0 || (isClosed && paid >= due) ? "paid" : "pending";
            })(),
            minimum_payment: selectedBillForDetails.billDetails.currentBillAmount * 0.15,
            late_fee: 0,
            // CORREÇÃO: As transações já foram filtradas corretamente no onViewDetails
            transactions: selectedBillForDetails.transactions.filter((t) => {
              // Garante que são apenas despesas (compras) - pagamentos não aparecem aqui
              return t.type === 'expense' && t.category_id;
            }),
            account: selectedBillForDetails.account,
          }}
          onClose={() => setSelectedBillForDetails(null)}
        />
      )}
    </div>
  );
}