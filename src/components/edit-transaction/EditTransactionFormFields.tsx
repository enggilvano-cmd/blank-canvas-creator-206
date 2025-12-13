import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DatePicker } from "@/components/ui/date-picker";
import { Account, Category, ACCOUNT_TYPE_LABELS } from "@/types";
import { formatCurrency } from "@/lib/formatters";

interface EditTransactionFormFieldsProps {
  formData: {
    description: string;
    amountInCents: number;
    date: Date;
    type: "income" | "expense";
    category_id: string;
    account_id: string;
    status: "pending" | "completed";
    invoiceMonth: string;
  };
  onFormDataChange: (updates: Partial<EditTransactionFormFieldsProps['formData']>) => void;
  accounts: Account[];
  filteredCategories: Category[];
  isTransfer?: boolean;
  hideStatusAndInvoice?: boolean;
}

export function EditTransactionFormFields({
  formData,
  onFormDataChange,
  accounts,
  filteredCategories,
  isTransfer = false,
  hideStatusAndInvoice = false,
}: EditTransactionFormFieldsProps) {
  return (
    <>
      {!isTransfer && (
        <div className="space-y-2">
          <Label htmlFor="description" className="text-caption">Descrição</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => onFormDataChange({ description: e.target.value })}
            placeholder="Ex: Supermercado, Salário..."
            required
            disabled={isTransfer}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="amount" className="text-caption">Valor</Label>
        <CurrencyInput
          id="amount"
          value={formData.amountInCents}
          onValueChange={(value) => onFormDataChange({ amountInCents: value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-caption">Data</Label>
        <DatePicker
          date={formData.date}
          onDateChange={(date) => date && onFormDataChange({ date })}
          placeholder="Selecione uma data"
        />
      </div>

      {!isTransfer && (
        <div className="space-y-2">
          <Label htmlFor="type" className="text-caption">Tipo</Label>
          <Select
            value={formData.type}
            onValueChange={(value: "income" | "expense") => 
              onFormDataChange({ type: value, category_id: "" })
            }
            disabled={isTransfer}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Receita</SelectItem>
              <SelectItem value="expense">Despesa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!isTransfer && (
        <div className="space-y-2">
          <Label htmlFor="category" className="text-caption">Categoria</Label>
          <Select
            value={formData.category_id}
            onValueChange={(value) => onFormDataChange({ category_id: value })}
            disabled={isTransfer}
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
        </div>
      )}

      {!isTransfer && (
        <div className="space-y-2">
          <Label htmlFor="account" className="text-caption">Conta</Label>
          <Select
            value={formData.account_id}
            onValueChange={(value) => onFormDataChange({ account_id: value })}
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
                          style={{ backgroundColor: account.color || "#6b7280" }}
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
        </div>
      )}

      {!isTransfer && !hideStatusAndInvoice && (
        <div className="space-y-2">
          <Label htmlFor="status" className="text-caption">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: "pending" | "completed") => onFormDataChange({ status: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!hideStatusAndInvoice &&
       formData.account_id &&
       accounts.find(acc => acc.id === formData.account_id)?.type === "credit" && (
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="invoiceMonth" className="text-caption">Mês da Fatura (opcional)</Label>
          <Select
            value={formData.invoiceMonth}
            onValueChange={(value) =>
              onFormDataChange({ invoiceMonth: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o mês da fatura" />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const months = [];
                const today = new Date();
                for (let i = -2; i <= 12; i++) {
                  const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                  months.push(
                    <SelectItem key={value} value={value}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </SelectItem>
                  );
                }
                return months;
              })()}
            </SelectContent>
          </Select>
          <p className="text-caption text-muted-foreground">
            Deixe em branco para usar o mês calculado automaticamente
          </p>
        </div>
      )}
    </>
  );
}
