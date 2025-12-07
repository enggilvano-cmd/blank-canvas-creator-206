import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface FixedTransactionOptionsProps {
  isFixed: boolean;
  date: string;
  isInstallment: boolean;
  onFixedChange: (checked: boolean) => void;
}

export function FixedTransactionOptions({
  isFixed,
  date,
  isInstallment,
  onFixedChange,
}: FixedTransactionOptionsProps) {
  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="fixed" className="text-headline cursor-pointer">
          Transação Fixa
        </Label>
        <Switch
          id="fixed"
          checked={isFixed}
          disabled={isInstallment}
          onCheckedChange={onFixedChange}
          className="data-[state=unchecked]:bg-muted data-[state=unchecked]:border data-[state=unchecked]:border-primary/50"
        />
      </div>

      {isFixed && (
        <div className="space-y-2 pt-2 animate-fade-in">
          <p className="text-body text-muted-foreground">
            Esta transação será criada automaticamente todo dia {parseInt(date.split('-')[2])} de cada mês, 
            do mês atual até dezembro do ano seguinte. A primeira transação usará o status selecionado, 
            e todas as demais serão criadas como "Pendente".
          </p>
        </div>
      )}
    </div>
  );
}
