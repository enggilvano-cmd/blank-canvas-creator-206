import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DatePicker } from "@/components/ui/date-picker";
import { createDateFromString } from "@/lib/dateUtils";

interface TransactionFormFieldsProps {
  description: string;
  type: string;
  amount: number;
  date: string;
  status: "pending" | "completed";
  lockType?: boolean;
  hideType?: boolean;
  validationErrors: Record<string, string>;
  onDescriptionChange: (value: string) => void;
  onTypeChange: (value: "income" | "expense" | "transfer") => void;
  onAmountChange: (value: number) => void;
  onDateChange: (value: string) => void;
  onStatusChange: (value: "pending" | "completed") => void;
}

export function TransactionFormFields({
  description,
  type,
  amount,
  date,
  status,
  lockType = false,
  hideType = false,
  validationErrors,
  onDescriptionChange,
  onTypeChange,
  onAmountChange,
  onDateChange,
  onStatusChange,
}: TransactionFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="description" className="text-caption">Descrição</Label>
        <Input
          id="description"
          placeholder="Ex: Compra no mercado, salário, etc."
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
        {validationErrors.description && (
          <p className="text-body text-destructive">{validationErrors.description}</p>
        )}
      </div>

      {hideType ? (
        <div className="space-y-2">
          <Label htmlFor="amount" className="text-caption">Valor</Label>
          <CurrencyInput
            id="amount"
            value={amount}
            onValueChange={onAmountChange}
            className="h-10 sm:h-11"
          />
          {validationErrors.amount && (
            <p className="text-sm text-destructive">{validationErrors.amount}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type" className="text-caption">Tipo</Label>
            <Select
              value={type}
              onValueChange={onTypeChange}
              disabled={lockType}
            >
              <SelectTrigger disabled={lockType}>
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
              value={amount}
              onValueChange={onAmountChange}
              className="h-10 sm:h-11"
            />
            {validationErrors.amount && (
              <p className="text-sm text-destructive">{validationErrors.amount}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date" className="text-caption">Data</Label>
          <DatePicker
            date={date ? createDateFromString(date) : undefined}
            onDateChange={(newDate) => {
              if (newDate) {
                const year = newDate.getFullYear();
                const month = String(newDate.getMonth() + 1).padStart(2, '0');
                const day = String(newDate.getDate()).padStart(2, '0');
                onDateChange(`${year}-${month}-${day}`);
              }
            }}
            placeholder="Selecione a data"
          />
          {validationErrors.date && (
            <p className="text-body text-destructive">{validationErrors.date}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status" className="text-caption">Status</Label>
          <Select
            value={status}
            onValueChange={onStatusChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
