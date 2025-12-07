import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { TransactionFilterChips, FilterChip } from "./TransactionFilterChips";
import { TransactionFilterDialog } from "./TransactionFilterDialog";
import type { Account, Category } from "@/types";

interface TransactionFiltersBarProps {
  // Search
  search: string;
  onSearchChange: (search: string) => void;
  
  // Sort
  sortBy: "date" | "amount";
  onSortByChange: (sortBy: "date" | "amount") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (order: "asc" | "desc") => void;
  
  // Filters
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
  onMonthChange: (date: Date) => void;
  customStartDate: Date | undefined;
  onCustomStartDateChange: (date: Date | undefined) => void;
  customEndDate: Date | undefined;
  onCustomEndDateChange: (date: Date | undefined) => void;
  
  // Data
  accountsByType: Account[];
  categories: Category[];
  availableInvoiceMonths: string[];
  filterChips: FilterChip[];
  onClearAllFilters: () => void;
}

export function TransactionFiltersBar({
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
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
  accountsByType,
  categories,
  availableInvoiceMonths,
  filterChips,
  onClearAllFilters,
}: TransactionFiltersBarProps) {
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  
  // Local search state with debounce (300ms for text inputs)
  const [localSearch, setLocalSearch] = useState(search);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Update parent search when debounced value changes
  useEffect(() => {
    if (debouncedSearch !== search) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, search, onSearchChange]);

  // Sync local search with prop changes (for external resets)
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-4">
          {/* Filter button and active chips */}
          <div className="flex flex-wrap items-center gap-3">
            <TransactionFilterDialog
              open={filterDialogOpen}
              onOpenChange={setFilterDialogOpen}
              filterType={filterType}
              onFilterTypeChange={(value) => onFilterTypeChange(value as typeof filterType)}
              filterStatus={filterStatus}
              onFilterStatusChange={(value) => onFilterStatusChange(value as typeof filterStatus)}
              filterIsFixed={filterIsFixed}
              onFilterIsFixedChange={onFilterIsFixedChange}
              filterIsProvision={filterIsProvision}
              onFilterIsProvisionChange={onFilterIsProvisionChange}
              filterInvoiceMonth={filterInvoiceMonth}
              onFilterInvoiceMonthChange={onFilterInvoiceMonthChange}
              filterAccountType={filterAccountType}
              onFilterAccountTypeChange={onFilterAccountTypeChange}
              filterAccount={filterAccount}
              onFilterAccountChange={onFilterAccountChange}
              filterCategory={filterCategory}
              onFilterCategoryChange={onFilterCategoryChange}
              periodFilter={periodFilter}
              onPeriodFilterChange={(value) => onPeriodFilterChange(value as typeof periodFilter)}
              selectedMonth={selectedMonth}
              onMonthChange={onMonthChange}
              customStartDate={customStartDate}
              onCustomStartDateChange={onCustomStartDateChange}
              customEndDate={customEndDate}
              onCustomEndDateChange={onCustomEndDateChange}
              accounts={accountsByType}
              categories={categories}
              availableInvoiceMonths={availableInvoiceMonths}
              activeFiltersCount={filterChips.length}
            />
            
            <TransactionFilterChips
              chips={filterChips}
              onClearAll={onClearAllFilters}
            />
          </div>

          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar transações..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort */}
            <div className="flex gap-2">
              <Select
                value={sortBy}
                onValueChange={(value) => onSortByChange(value as typeof sortBy)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="amount">Valor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")
                }
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
