import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InvoiceMonthSelectorProps {
  invoiceMonth: string;
  onInvoiceMonthChange: (value: string) => void;
}

export function InvoiceMonthSelector({
  invoiceMonth,
  onInvoiceMonthChange,
}: InvoiceMonthSelectorProps) {
  const generateMonthOptions = () => {
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
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <Label htmlFor="invoiceMonth" className="text-caption">Mês da Fatura</Label>
      <Select
        value={invoiceMonth}
        onValueChange={onInvoiceMonthChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione o mês" />
        </SelectTrigger>
        <SelectContent>
          {generateMonthOptions()}
        </SelectContent>
      </Select>
      <p className="text-caption text-muted-foreground">
        Selecione para qual fatura esse gasto será lançado
      </p>
    </div>
  );
}
