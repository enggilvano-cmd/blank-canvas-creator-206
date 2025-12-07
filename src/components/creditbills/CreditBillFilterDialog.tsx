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
import { Checkbox } from "@/components/ui/checkbox";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CreditBillFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId: string;
  onAccountChange: (value: string) => void;
  filterBillStatus: string;
  onBillStatusChange: (value: string) => void;
  filterPaymentStatus: string;
  onPaymentStatusChange: (value: string) => void;
  hideZeroBalance: boolean;
  onHideZeroBalanceChange: (value: boolean) => void;
  creditAccounts: Array<{ id: string; name: string; color?: string }>;
  activeFiltersCount: number;
}

export function CreditBillFilterDialog({
  open,
  onOpenChange,
  selectedAccountId,
  onAccountChange,
  filterBillStatus,
  onBillStatusChange,
  filterPaymentStatus,
  onPaymentStatusChange,
  hideZeroBalance,
  onHideZeroBalanceChange,
  creditAccounts,
  activeFiltersCount,
}: CreditBillFilterDialogProps) {
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
          <DialogTitle>Filtros de Faturas</DialogTitle>
          <DialogDescription>
            Configure os filtros para visualizar suas faturas de cartão
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Cartão */}
          <div>
            <Label htmlFor="filterCard">Cartão de Crédito</Label>
            <Select value={selectedAccountId} onValueChange={onAccountChange}>
              <SelectTrigger id="filterCard" className="mt-2">
                <SelectValue placeholder="Selecione um cartão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {creditAccounts.map((account) => (
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

          {/* Status da Fatura e Pagamento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterBillStatus">Status da Fatura</Label>
              <Select value={filterBillStatus} onValueChange={onBillStatusChange}>
                <SelectTrigger id="filterBillStatus" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Aberta</SelectItem>
                  <SelectItem value="closed">Fechada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterPaymentStatus">Pagamento</Label>
              <Select value={filterPaymentStatus} onValueChange={onPaymentStatusChange}>
                <SelectTrigger id="filterPaymentStatus" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ocultar Zeradas */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="hideZeroBills"
              checked={hideZeroBalance}
              onCheckedChange={onHideZeroBalanceChange}
            />
            <Label
              htmlFor="hideZeroBills"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Ocultar faturas zeradas
            </Label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
