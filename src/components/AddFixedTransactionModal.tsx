import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getTodayString, createDateFromString } from "@/lib/dateUtils";
import { useCategories } from "@/hooks/useCategories";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DatePicker } from "@/components/ui/date-picker";
import { ACCOUNT_TYPE_LABELS } from "@/types";
import { formatCurrency } from "@/lib/formatters";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance: number;
  color: string;
  limit_amount?: number | null;
}

interface FixedTransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category_id: string | null;
  account_id: string;
  date: string;
  is_fixed: boolean;
  status?: 'pending' | 'completed';
  is_provision?: boolean;
}

interface AddFixedTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTransaction: (transaction: FixedTransactionInput) => void;
  accounts: Account[];
}

export function AddFixedTransactionModal({
  open,
  onOpenChange,
  onAddTransaction,
  accounts,
}: AddFixedTransactionModalProps) {
  const [formData, setFormData] = useState({
    description: "",
    amount: 0,
    date: getTodayString(),
    type: "" as "income" | "expense" | "",
    category_id: "",
    account_id: "",
    status: "pending" as "pending" | "completed",
    is_provision: false,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { categories } = useCategories();

  useEffect(() => {
    if (open) {
      setFormData({
        description: "",
        amount: 0,
        date: getTodayString(),
        type: "",
        category_id: "",
        account_id: "",
        status: "pending",
        is_provision: false,
      });
      setValidationErrors({});
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    if (!formData.type) return categories;
    return categories.filter(
      (cat) => cat.type === formData.type || cat.type === "both"
    );
  }, [categories, formData.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formData.description.trim()) {
      errors.description = "Descrição é obrigatória";
    }

    if (formData.amount <= 0) {
      errors.amount = "Valor deve ser maior que zero";
    }

    if (!formData.type) {
      errors.type = "Tipo é obrigatório";
    }

    if (!formData.account_id) {
      errors.account_id = "Conta é obrigatória";
    }
    
    if (!formData.date) {
      errors.date = "Data é obrigatória";
    }

    // ✅ Validação: Categoria é obrigatória para provisões
    if (formData.is_provision && !formData.category_id) {
      errors.category_id = "Categoria é obrigatória para provisões";
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast({
        title: "Erro de validação",
        description: "Por favor, corrija os erros no formulário.",
        variant: "destructive",
      });
      return;
    }

    onAddTransaction({
      description: formData.description,
      amount: formData.amount,
      date: formData.date,
      type: formData.type as "income" | "expense",
      category_id: formData.category_id || null,
      account_id: formData.account_id,
      status: formData.status,
      is_fixed: true,
      is_provision: formData.is_provision,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Nova Transação Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-caption">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex: Compra no mercado, salário, etc."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
            {validationErrors.description && (
              <p className="text-body text-destructive">{validationErrors.description}</p>
            )}
          </div>

          {/* Type and Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className="text-caption">Tipo</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData((prev) => ({
                  ...prev,
                  type: value as "income" | "expense",
                  category_id: "",
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors.type && (
                <p className="text-body text-destructive">{validationErrors.type}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-caption">Valor</Label>
              <CurrencyInput
                id="amount"
                value={formData.amount}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, amount: value }))}
                className="h-10 sm:h-11"
              />
              {validationErrors.amount && (
                <p className="text-sm text-destructive">{validationErrors.amount}</p>
              )}
            </div>
          </div>

          {/* Date and Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-caption">Data</Label>
              <DatePicker
                date={formData.date ? createDateFromString(formData.date) : undefined}
                onDateChange={(newDate) => {
                  if (newDate) {
                    const year = newDate.getFullYear();
                    const month = String(newDate.getMonth() + 1).padStart(2, '0');
                    const day = String(newDate.getDate()).padStart(2, '0');
                    setFormData((prev) => ({ ...prev, date: `${year}-${month}-${day}` }));
                  }
                }}
                placeholder="Selecione a data"
              />
              {validationErrors.date && (
                <p className="text-body text-destructive">{validationErrors.date}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id" className="text-caption">Categoria</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => {
                  const selectedCategory = categories.find(c => c.id === value);
                  setFormData((prev) => {
                    let newType = prev.type;
                    if (!newType && selectedCategory && selectedCategory.type !== 'both') {
                      newType = selectedCategory.type as "income" | "expense";
                    }
                    return { ...prev, category_id: value, type: newType };
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.category_id && (
                <p className="text-body text-destructive">{validationErrors.category_id}</p>
              )}
            </div>
          </div>

          {/* Account */}
          <div className="space-y-2">
            <Label htmlFor="account_id" className="text-caption">Conta</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, account_id: value }))}
            >
              <SelectTrigger className="h-auto">
                <SelectValue placeholder="Selecione uma conta">
                  {formData.account_id && (() => {
                    const selectedAccount = accounts.find((acc) => acc.id === formData.account_id);
                    if (!selectedAccount) return null;
                    return (
                      <div className="flex flex-col gap-1 w-full py-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: selectedAccount.color || "#6b7280",
                            }}
                          />
                          <span className="text-body font-medium">{selectedAccount.name}</span>
                          <span className="text-caption text-muted-foreground">
                            - {ACCOUNT_TYPE_LABELS[selectedAccount.type]}
                          </span>
                        </div>
                        <div className="text-caption text-muted-foreground pl-5">
                          {formatCurrency(selectedAccount.balance)}
                          {selectedAccount.limit_amount && selectedAccount.limit_amount > 0 && (
                            <span className="text-primary font-semibold"> + {formatCurrency(selectedAccount.limit_amount)} limite</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: account.color || "#6b7280",
                            }}
                          />
                          <span className="text-body">{account.name}</span>
                        </div>
                        <span className="ml-2 text-caption text-muted-foreground">
                          {ACCOUNT_TYPE_LABELS[account.type]}
                        </span>
                      </div>
                      <div className="text-caption text-muted-foreground">
                        {formatCurrency(account.balance)}
                        {account.limit_amount && account.limit_amount > 0 && (
                          <span className="text-primary"> + {formatCurrency(account.limit_amount)} limite</span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.account_id && (
              <p className="text-body text-destructive">{validationErrors.account_id}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_provision"
              checked={formData.is_provision}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, is_provision: checked }))
              }
            />
            <Label htmlFor="is_provision">Transação com Provisão</Label>
          </div>

          <div className="text-caption text-muted-foreground bg-muted/50 p-3 rounded-md">
            A transação será gerada automaticamente todo dia <strong>{createDateFromString(formData.date).getDate()}</strong> de cada mês.
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 text-body"
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 text-body">
              Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
