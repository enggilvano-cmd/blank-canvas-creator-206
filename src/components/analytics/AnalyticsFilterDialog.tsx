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
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Account {
  id: string;
  name: string;
  type: string;
  color?: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  type: string;
}

interface AnalyticsFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterAccount: string;
  onFilterAccountChange: (value: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  customStartDate?: Date;
  onCustomStartDateChange: (date?: Date) => void;
  customEndDate?: Date;
  onCustomEndDateChange: (date?: Date) => void;
  accounts: Account[];
  categories: Category[];
  activeFiltersCount: number;
}

export function AnalyticsFilterDialog({
  open,
  onOpenChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  filterAccount,
  onFilterAccountChange,
  filterCategory,
  onFilterCategoryChange,
  dateFilter,
  onDateFilterChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  accounts,
  categories,
  activeFiltersCount,
}: AnalyticsFilterDialogProps) {
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
          <DialogTitle>Filtros de Análises</DialogTitle>
          <DialogDescription>
            Configure os filtros para visualizar suas análises financeiras
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

          {/* Conta e Categoria */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterAccount">Conta</Label>
              <Select value={filterAccount} onValueChange={onFilterAccountChange}>
                <SelectTrigger id="filterAccount" className="mt-2">
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
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

            <div>
              <Label htmlFor="filterCategory">Categoria</Label>
              <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
                <SelectTrigger id="filterCategory" className="mt-2">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
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
          </div>

          {/* Período */}
          <div>
            <Label htmlFor="dateFilter">Período</Label>
            <Select value={dateFilter} onValueChange={onDateFilterChange}>
              <SelectTrigger id="dateFilter" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="current_month">Mês Atual</SelectItem>
                <SelectItem value="month_picker">Seletor de Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range */}
          {dateFilter === "custom" && (
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
