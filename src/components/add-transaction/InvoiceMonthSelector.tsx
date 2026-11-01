import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getInvoiceMonthOptions } from "@/lib/dateUtils";

interface InvoiceMonthSelectorProps {
  invoiceMonth: string;
  onInvoiceMonthChange: (value: string) => void;
}

export function InvoiceMonthSelector({
  invoiceMonth,
  onInvoiceMonthChange,
}: InvoiceMonthSelectorProps) {
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
          {getInvoiceMonthOptions(invoiceMonth).map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-caption text-muted-foreground">
        Selecione para qual fatura esse gasto será lançado. Para parcelamentos, cada parcela será lançada no mês correspondente.
      </p>
    </div>
  );
}
