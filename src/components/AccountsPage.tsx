import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  CreditCard,
  PiggyBank,
  Wallet,
  MoreVertical,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Utensils,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { ImportAccountsModal } from "@/components/ImportAccountsModal";
import { useSettings } from "@/context/SettingsContext";
import { AccountFilterDialog } from "@/components/accounts/AccountFilterDialog";
import { AccountFilterChips } from "@/components/accounts/AccountFilterChips";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useDebounce } from "@/hooks/useDebounce";

import { Account, ImportAccountData } from '@/types';

interface AccountsFilters {
  searchTerm: string;
  filterType: "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  hideZeroBalance: boolean;
}

interface AccountsPageProps {
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (accountId: string) => void;
  onPayCreditCard?: (account: Account) => void;
  onTransfer?: () => void;
  onImportAccounts?: (accounts: ImportAccountData[], accountsToReplace: string[]) => void;
  initialFilterType?: "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  importModalOpen?: boolean;
  onImportModalOpenChange?: (open: boolean) => void;
}

export function AccountsPage({
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onPayCreditCard,
  onTransfer: _onTransfer,
  onImportAccounts,
  initialFilterType = "all",
  importModalOpen: externalImportModalOpen,
  onImportModalOpenChange,
}: AccountsPageProps) {
  const { accounts } = useAccounts();
  const { formatCurrency } = useSettings();

  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<AccountsFilters>(
    'accounts-filters',
    {
      searchTerm: "",
      filterType: initialFilterType,
      hideZeroBalance: false,
    }
  );

  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;
  const hideZeroBalance = filters.hideZeroBalance;
  
  // ✅ Debounce search to avoid excessive filtering on every keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));
  const setHideZeroBalance = (value: boolean) => setFilters((prev) => ({ ...prev, hideZeroBalance: value }));

  const [internalImportModalOpen, setInternalImportModalOpen] = useState(false);
  const importModalOpen = externalImportModalOpen ?? internalImportModalOpen;
  const setImportModalOpen = (open: boolean) => {
    setInternalImportModalOpen(open);
    onImportModalOpenChange?.(open);
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const { toast } = useToast();

  // Helper functions (must be declared before filterChips useMemo)
  const getAccountIcon = (type: string) => {
    switch (type) {
      case "checking":
        return <Wallet className="h-5 w-5" />;
      case "savings":
        return <PiggyBank className="h-5 w-5" />;
      case "credit":
        return <CreditCard className="h-5 w-5" />;
      case "investment":
        return <TrendingUp className="h-5 w-5" />;
      case "meal_voucher":
        return <Utensils className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case "checking":
        return "Corrente";
      case "savings":
        return "Poupança";
      case "credit":
        return "Cartão de Crédito";
      case "investment":
        return "Investimento";
      case "meal_voucher":
        return "Vale Refeição/Alimentação";
      default:
        return type;
    }
  };

  const getAccountTypeBadge = (type: string) => {
    const variants = {
      checking: "default",
      savings: "secondary",
      credit: "destructive",
      investment: "secondary",
      meal_voucher: "default",
    } as const;
    return variants[type as keyof typeof variants] || "default";
  };

  // Generate filter chips (after helper functions)
  const filterChips = useMemo(() => {
    const chips = [];
    
    if (filterType !== "all") {
      chips.push({
        id: "type",
        label: getAccountTypeLabel(filterType),
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    if (hideZeroBalance) {
      chips.push({
        id: "hideZero",
        label: "Ocultar Zeradas",
        value: "hideZero",
        onRemove: () => setHideZeroBalance(false),
      });
    }

    return chips;
  }, [filterType, hideZeroBalance]);

  const clearAllFilters = () => {
    setFilterType("all");
    setHideZeroBalance(false);
  };

  const filteredAccounts = accounts
    .filter((account) => {
      // \u2705 Use debounced search term for better performance
      const matchesSearch = account.name
        .toLowerCase()
        .includes(debouncedSearchTerm.toLowerCase());
      const matchesType = filterType === "all" || account.type === filterType;
      const matchesZeroBalance = !hideZeroBalance || account.balance !== 0;
      return matchesSearch && matchesType && matchesZeroBalance;
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteAccount = () => {
    if (accountToDelete) {
      onDeleteAccount(accountToDelete.id);
      toast({
        title: "Conta Excluída",
        description: "Conta removida com sucesso",
      });
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
    }
  };

  const totalBalance = filteredAccounts
    .reduce((sum, acc) => {
      if (acc.type === "credit") {
        return sum + (acc.balance > 0 ? acc.balance : 0);
      }
      return sum + acc.balance;
    }, 0);

  const creditUsed = filteredAccounts
    .reduce((sum, acc) => {
      if (acc.type === "credit") {
        // Cartões de crédito: saldo negativo é dívida
        return sum + Math.abs(Math.min(acc.balance, 0));
      } else if (acc.limit_amount && acc.limit_amount > 0 && acc.balance < 0) {
        // Outras contas com limite: saldo negativo é uso de cheque especial
        return sum + Math.abs(acc.balance);
      }
      return sum;
    }, 0);

  const creditAvailable = filteredAccounts
    .filter((acc) => acc.limit_amount && acc.limit_amount > 0)
    .reduce((sum, acc) => {
      if (acc.type === "credit") {
        // Para cartões de crédito: limite - usado
        const used = Math.abs(Math.min(acc.balance, 0));
        const available = (acc.limit_amount || 0) - used;
        return sum + available;
      } else {
        // Para outras contas com limite (cheque especial): limite completo
        return sum + (acc.limit_amount || 0);
      }
    }, 0);

  const exportToExcel = async () => {
    try {
      const { exportAccountsToExcel } = await import('@/lib/exportUtils');
      await exportAccountsToExcel(filteredAccounts);
      
      toast({
        title: "Sucesso",
        description: `${filteredAccounts.length} conta${filteredAccounts.length !== 1 ? 's' : ''} exportada${filteredAccounts.length !== 1 ? 's' : ''} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar contas",
        variant: "destructive",
      });
    }
  };

  const handleImportAccounts = (accountsToAdd: ImportAccountData[], accountsToReplaceIds: string[]) => {
    if (onImportAccounts) {
      onImportAccounts(accountsToAdd, accountsToReplaceIds);
    }
  };

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div className="w-full text-center">
                <p className="text-caption font-medium mb-1">Saldo Total</p>
                <div className={`balance-text ${
                  totalBalance >= 0 ? "balance-positive" : "balance-negative"
                }`}>
                  {formatCurrency(totalBalance * 100)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div className="w-full text-center">
                <p className="text-caption font-medium mb-1">Dívida Total</p>
                <div className="balance-text balance-negative">
                  {formatCurrency(creditUsed * 100)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div className="w-full text-center">
                <p className="text-caption font-medium mb-1">Crédito Disponível</p>
                <div className="balance-text text-primary">
                  {formatCurrency(creditAvailable)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Wallet className="h-5 w-5 text-accent" />
              </div>
              <div className="w-full text-center">
                <p className="text-caption font-medium mb-1">Total de Contas</p>
                <div className="balance-text">
                  {filteredAccounts.length}
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
              <AccountFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                hideZeroBalance={hideZeroBalance}
                onHideZeroBalanceChange={setHideZeroBalance}
                activeFiltersCount={filterChips.length}
              />
              
              <AccountFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAccounts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-headline font-semibold mb-2">
              {searchTerm || filterType !== "all"
                ? "Nenhum resultado encontrado"
                : "Nenhuma conta cadastrada"}
            </h3>
            <p className="text-body text-muted-foreground mb-4">
              {searchTerm || filterType !== "all"
                ? "Tente ajustar os filtros"
                : "Adicione sua primeira conta para começar"}
            </p>
            {!searchTerm && filterType === "all" && (
              <Button onClick={onAddAccount} className="gap-2 apple-interaction">
                <Plus className="h-4 w-4" />
                Adicionar Conta
              </Button>
            )}
          </div>
        ) : (
          filteredAccounts.map((account) => (
            <Card key={account.id} className="financial-card apple-interaction group">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  {/* Header com Ícone, Nome e Menu */}
                  <div className="flex items-center gap-3">
                    {/* Ícone da Conta */}
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: account.color || "#6b7280" }}
                    >
                      {getAccountIcon(account.type)}
                    </div>

                    {/* Nome e Badge */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-body-large font-semibold truncate mb-1">
                        {account.name}
                      </h3>
                      <Badge
                        variant={getAccountTypeBadge(account.type)}
                        className="gap-1 text-caption h-5 px-2 inline-flex text-white"
                      >
                        {getAccountTypeLabel(account.type)}
                      </Badge>
                    </div>

                    {/* Menu de Ações */}
                    <div className="flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditAccount(account)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          {account.type === "credit" && account.balance < 0 && onPayCreditCard && (
                            <DropdownMenuItem onClick={() => onPayCreditCard(account)}>
                              <DollarSign className="h-4 w-4 mr-2" />
                              Pagar Fatura
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(account)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Informações de Saldo */}
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    {account.type === "credit" ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-caption text-muted-foreground">
                              {account.balance < 0 ? "Dívida" : "Crédito"}
                            </span>
                            <span
                              className={`text-body font-bold ${
                                account.balance < 0 ? "text-destructive" : "text-success"
                              }`}
                            >
                              {formatCurrency(Math.abs(account.balance) * 100)}
                            </span>
                          </div>
                          {(account.limit_amount || 0) > 0 && (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-caption text-muted-foreground">
                                  Disponível
                                </span>
                                <span className="text-caption font-medium text-primary">
                                  {formatCurrency((account.limit_amount || 0) - Math.abs(Math.min(account.balance, 0)))}
                                </span>
                              </div>
                              {/* Barra de Progresso */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-caption text-muted-foreground">Limite</span>
                                  <span className="text-caption font-medium">
                                    {formatCurrency(account.limit_amount ?? 0)}
                                  </span>
                                </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-muted rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full transition-all duration-300 bg-destructive"
                                    style={{
                                      width: `${Math.min(
                                        (Math.abs(Math.min(account.balance, 0)) / (account.limit_amount || 1)) * 100,
                                        100
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-medium w-10 text-right">
                                  {Math.round(
                                    (Math.abs(Math.min(account.balance, 0)) / (account.limit_amount || 1)) * 100
                                  )}%
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Saldo</span>
                          <span
                            className={`text-sm font-bold ${
                              account.balance >= 0 ? "balance-positive" : "balance-negative"
                            }`}
                          >
                            {formatCurrency(account.balance * 100)}
                          </span>
                        </div>
                        {(account.limit_amount || 0) > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Limite</span>
                              <span className="text-xs font-medium">
                                {formatCurrency(account.limit_amount ?? 0)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-300 bg-warning"
                                  style={{
                                    width: `${Math.min(
                                      account.balance < 0 
                                        ? (Math.abs(account.balance) / (account.limit_amount || 1)) * 100
                                        : 0,
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium w-10 text-right">
                                {account.balance < 0 
                                  ? Math.round((Math.abs(account.balance) / (account.limit_amount || 1)) * 100)
                                  : 0}%
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Import Modal */}
      <ImportAccountsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        accounts={accounts}
        onImportAccounts={handleImportAccounts}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {accountToDelete?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
