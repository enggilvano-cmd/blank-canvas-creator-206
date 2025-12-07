import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePicker } from "@/components/ui/date-picker";
import { useDebounce } from "@/hooks/useDebounce";
import { useState, useEffect } from "react";

interface TransactionFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  filterAccountType: string;
  onFilterAccountTypeChange: (value: string) => void;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  customStartDate?: Date;
  onCustomStartDateChange: (date?: Date) => void;
  customEndDate?: Date;
  onCustomEndDateChange: (date?: Date) => void;
  t: (key: string) => string;
}

export function TransactionFilters({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  dateFilter,
  onDateFilterChange,
  filterAccountType,
  onFilterAccountTypeChange,
  selectedMonth,
  onMonthChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  t,
}: TransactionFiltersProps) {
  // Local search state with debounce (300ms)
  const [localSearch, setLocalSearch] = useState(searchTerm);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Update parent search when debounced value changes
  useEffect(() => {
    if (debouncedSearch !== searchTerm) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, searchTerm, onSearchChange]);

  // Sync local search with prop changes
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder={t("transactions.searchPlaceholder")}
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>{t("transactions.filters.type")}</Label>
          <Select value={filterType} onValueChange={onFilterTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("transactions.filters.allTypes")}</SelectItem>
              <SelectItem value="income">{t("transactions.types.income")}</SelectItem>
              <SelectItem value="expense">{t("transactions.types.expense")}</SelectItem>
              <SelectItem value="transfer">{t("transactions.types.transfer")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t("transactions.filters.status")}</Label>
          <Select value={filterStatus} onValueChange={onFilterStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("transactions.filters.allStatus")}</SelectItem>
              <SelectItem value="pending">{t("transactions.status.pending")}</SelectItem>
              <SelectItem value="completed">{t("transactions.status.completed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t("transactions.filters.accountType")}</Label>
          <Select value={filterAccountType} onValueChange={onFilterAccountTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("transactions.filters.allAccountTypes")}</SelectItem>
              <SelectItem value="checking">{t("accounts.types.checking")}</SelectItem>
              <SelectItem value="savings">{t("accounts.types.savings")}</SelectItem>
              <SelectItem value="credit">{t("accounts.types.credit")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t("transactions.filters.period")}</Label>
          <Select value={dateFilter} onValueChange={onDateFilterChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("transactions.filters.allDates")}</SelectItem>
              <SelectItem value="current_month">{t("transactions.filters.currentMonth")}</SelectItem>
              <SelectItem value="month_picker">{t("transactions.filters.selectMonth")}</SelectItem>
              <SelectItem value="custom">{t("transactions.filters.customPeriod")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Month Picker */}
      {dateFilter === "month_picker" && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(subMonths(selectedMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="px-4 py-2">
            {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(addMonths(selectedMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Custom Date Range */}
      {dateFilter === "custom" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{t("transactions.filters.startDate")}</Label>
            <DatePicker
              date={customStartDate}
              onDateChange={onCustomStartDateChange}
              placeholder={t("transactions.filters.selectDate")}
            />
          </div>

          <div>
            <Label>{t("transactions.filters.endDate")}</Label>
            <DatePicker
              date={customEndDate}
              onDateChange={onCustomEndDateChange}
              placeholder={t("transactions.filters.selectDate")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
