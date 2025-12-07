import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AccountFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterType: "all" | "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  onFilterTypeChange: (value: string) => void;
  hideZeroBalance: boolean;
  onHideZeroBalanceChange: (value: boolean) => void;
  activeFiltersCount: number;
}

export function AccountFilterDialog({
  open,
  onOpenChange,
  filterType,
  onFilterTypeChange,
  hideZeroBalance,
  onHideZeroBalanceChange,
  activeFiltersCount,
}: AccountFilterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Filtros de Contas</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="type" className="text-sm font-medium">
              Tipo de Conta
            </label>
            <Select
              value={filterType}
              onValueChange={onFilterTypeChange}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="checking">Corrente</SelectItem>
                <SelectItem value="savings">Poupança</SelectItem>
                <SelectItem value="credit">Cartão de Crédito</SelectItem>
                <SelectItem value="investment">Investimento</SelectItem>
                <SelectItem value="meal_voucher">Vale Refeição/Alimentação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="hideZero"
              checked={hideZeroBalance}
              onCheckedChange={onHideZeroBalanceChange}
            />
            <Label
              htmlFor="hideZero"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Ocultar contas zeradas
            </Label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
