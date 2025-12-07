import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface InstallmentOptionsProps {
  isInstallment: boolean;
  installments: string;
  customInstallments: string;
  amount: number;
  isFixed: boolean;
  onInstallmentChange: (checked: boolean) => void;
  onInstallmentsChange: (value: string) => void;
  onCustomInstallmentsChange: (value: string) => void;
}

export function InstallmentOptions({
  isInstallment,
  installments,
  customInstallments,
  amount,
  isFixed,
  onInstallmentChange,
  onInstallmentsChange,
  onCustomInstallmentsChange,
}: InstallmentOptionsProps) {
  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="installment" className="text-headline cursor-pointer">
          Parcelamento
        </Label>
        <Switch
          id="installment"
          checked={isInstallment}
          disabled={isFixed}
          onCheckedChange={onInstallmentChange}
          className="data-[state=unchecked]:bg-muted data-[state=unchecked]:border data-[state=unchecked]:border-primary/50"
        />
      </div>

      {isInstallment && (
        <div className="space-y-4 pt-2 animate-fade-in">
          <div className="space-y-2">
            <Label htmlFor="installments" className="text-caption">Número de Parcelas</Label>
            <Select
              value={installments}
              onValueChange={(value) => {
                onInstallmentsChange(value);
                if (value !== "custom") {
                  onCustomInstallmentsChange("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o número de parcelas" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 59 }, (_, i) => i + 2).map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num}x
                    {amount > 0
                      ? ` de ${new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format((amount / 100) / (num || 1))}`
                      : ""}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            
            {installments === "custom" && (
              <div className="space-y-2 pt-2 animate-fade-in">
                <Label htmlFor="customInstallments" className="text-caption">Número personalizado de parcelas</Label>
                <Input
                  id="customInstallments"
                  type="number"
                  min="61"
                  max="360"
                  placeholder="Ex: 120"
                  value={customInstallments}
                  onChange={(e) => onCustomInstallmentsChange(e.target.value)}
                />
                {customInstallments && parseInt(customInstallments) > 0 && amount > 0 && (
                  <p className="text-body text-muted-foreground">
                    {parseInt(customInstallments)}x de{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format((amount / 100) / parseInt(customInstallments))}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
