import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

interface TransactionFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterIsFixed: string;
  onFilterIsFixedChange: (value: string) => void;
  filterIsProvision: string;
  onFilterIsProvisionChange: (value: string) => void;
  filterInvoiceMonth: string;
  onFilterInvoiceMonthChange: (value: string) => void;
  filterAccountType: string;
  onFilterAccountTypeChange: (value: string) => void;
  filterAccount: string;
  onFilterAccountChange: (value: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (value: string) => void;
  periodFilter: string;
  onPeriodFilterChange: (value: string) => void;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  customStartDate?: Date;
  onCustomStartDateChange: (date?: Date) => void;
  customEndDate?: Date;
  onCustomEndDateChange: (date?: Date) => void;
  accounts: Array<{ id: string; name: string; type: string; color?: string }>;
  categories: Array<{ id: string; name: string; color: string; type: string }>;
  availableInvoiceMonths: string[]; // Meses disponíveis no formato "YYYY-MM"
  activeFiltersCount: number;
}

export function TransactionFilterDialog({
  open,
  onOpenChange,
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
  onMonthChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  accounts,
  categories,
  availableInvoiceMonths,
  activeFiltersCount,
}: TransactionFilterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <Badge variant="default" className="ml-1 px-1.5 py-0 h-5 min-w-5 rounded-full">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtros de Transações</DialogTitle>
          <DialogDescription>
            Configure os filtros para visualizar suas transações
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Tipo e Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterType">Tipo</Label>
              <Select value={filterType} onValueChange={onFilterTypeChange}>
                <SelectTrigger id="filterType" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterStatus">Status</Label>
              <Select value={filterStatus} onValueChange={onFilterStatusChange}>
                <SelectTrigger id="filterStatus" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fixa e Provisão */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterIsFixed">Fixa</Label>
              <Select value={filterIsFixed} onValueChange={onFilterIsFixedChange}>
                <SelectTrigger id="filterIsFixed" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="true">Apenas Fixas</SelectItem>
                  <SelectItem value="false">Excluir Fixas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterIsProvision">Provisão</Label>
              <Select value={filterIsProvision} onValueChange={onFilterIsProvisionChange}>
                <SelectTrigger id="filterIsProvision" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="true">Apenas Provisões</SelectItem>
                  <SelectItem value="false">Excluir Provisões</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mês da Fatura - só exibe se houver meses disponíveis */}
          {availableInvoiceMonths.length > 0 && (
            <div>
              <Label htmlFor="filterInvoiceMonth">Mês da Fatura</Label>
              <Select value={filterInvoiceMonth} onValueChange={onFilterInvoiceMonthChange}>
                <SelectTrigger id="filterInvoiceMonth" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableInvoiceMonths.map(monthValue => {
                    const [year, month] = monthValue.split("-");
                    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                    const label = `${monthNames[parseInt(month, 10) - 1]}/${year}`;
                    return (
                      <SelectItem key={monthValue} value={monthValue}>{label}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tipo de Conta e Conta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterAccountType">Tipo de Conta</Label>
              <Select
                value={filterAccountType}
                onValueChange={onFilterAccountTypeChange}
              >
                <SelectTrigger id="filterAccountType" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="checking">Conta Corrente</SelectItem>
                  <SelectItem value="credit">Cartão de Crédito</SelectItem>
                  <SelectItem value="investment">Investimento</SelectItem>
                  <SelectItem value="savings">Poupança</SelectItem>
                  <SelectItem value="meal_voucher">Vale Refeição/Alimentação</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterAccount">Conta</Label>
              <Select value={filterAccount} onValueChange={onFilterAccountChange}>
                <SelectTrigger id="filterAccount" className="mt-2">
                  <SelectValue placeholder="Conta Específica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: account.color || "#6b7280" }}
                        />
                        <span>{account.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Label htmlFor="filterCategory">Categoria</Label>
            <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
              <SelectTrigger id="filterCategory" className="mt-2">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.color || "#6b7280" }}
                      />
                      <span>{category.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Período */}
          <div>
            <Label htmlFor="periodFilter">Período</Label>
            <Select value={periodFilter} onValueChange={onPeriodFilterChange}>
              <SelectTrigger id="periodFilter" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="current_month">Mês Atual</SelectItem>
                <SelectItem value="month_picker">Seletor de Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Month Picker */}
          {periodFilter === "month_picker" && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onMonthChange(subMonths(selectedMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <Badge variant="secondary" className="px-4 py-2 text-sm">
                    {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onMonthChange(addMonths(selectedMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Custom Date Range */}
          {periodFilter === "custom" && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data Inicial</Label>
                  <DatePicker
                    date={customStartDate}
                    onDateChange={onCustomStartDateChange}
                    placeholder="Selecione"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Data Final</Label>
                  <DatePicker
                    date={customEndDate}
                    onDateChange={onCustomEndDateChange}
                    placeholder="Selecione"
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
