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
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { Account, Category } from "@/types";

interface FixedTransactionFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterType: "all" | "income" | "expense";
  onFilterTypeChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  accountId: string;
  onAccountIdChange: (value: string) => void;
  isProvision: string;
  onIsProvisionChange: (value: string) => void;
  activeFiltersCount: number;
  accounts: Account[];
  categories: Category[];
}

export function FixedTransactionFilterDialog({
  open,
  onOpenChange,
  filterType,
  onFilterTypeChange,
  categoryId,
  onCategoryIdChange,
  accountId,
  onAccountIdChange,
  isProvision,
  onIsProvisionChange,
  activeFiltersCount,
  accounts,
  categories,
}: FixedTransactionFilterDialogProps) {
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
          <DialogTitle>Filtros de Transações Fixas</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="type" className="text-sm font-medium">
              Tipo de Transação
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
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="category" className="text-sm font-medium">
              Categoria
            </label>
            <Select value={categoryId} onValueChange={onCategoryIdChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="account" className="text-sm font-medium">
              Conta
            </label>
            <Select value={accountId} onValueChange={onAccountIdChange}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {[...accounts].sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="provision" className="text-sm font-medium">
              Provisão
            </label>
            <Select value={isProvision} onValueChange={onIsProvisionChange}>
              <SelectTrigger id="provision">
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
      </DialogContent>
    </Dialog>
  );
}
