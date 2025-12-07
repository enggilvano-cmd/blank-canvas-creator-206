import { useState, FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PREDEFINED_COLORS, ACCOUNT_TYPE_LABELS } from "@/types";
import { ColorPicker } from "./forms/ColorPicker";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { AddAccountModalProps } from "@/types/formProps";
import { useOfflineAccountMutations } from "@/hooks/useTransactionHandlers";

export function AddAccountModal({ open, onOpenChange }: AddAccountModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "" as "checking" | "savings" | "credit" | "investment" | "meal_voucher" | "",
    balanceInCents: 0,
    limitInCents: 0,
    dueDate: "",
    closingDate: "",
    color: PREDEFINED_COLORS[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { handleAddAccount } = useOfflineAccountMutations();

  const handleColorChange = (color: string) => {
    setFormData((prev) => ({ ...prev, color }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // --- CORREÇÃO: Validação de Cartão de Crédito ---
    if (formData.type === "credit") {
      if (formData.limitInCents <= 0) {
        toast({
          title: "Erro",
          description: "O limite é obrigatório para cartões de crédito",
          variant: "destructive",
        });
        return;
      }
      if (!formData.closingDate) {
        toast({
          title: "Erro",
          description: "A data de fechamento é obrigatória para cartões de crédito",
          variant: "destructive",
        });
        return;
      }
      if (!formData.dueDate) {
        toast({
          title: "Erro",
          description: "A data de vencimento é obrigatória para cartões de crédito",
          variant: "destructive",
        });
        return;
      }
    }
    // --- Fim da Correção ---

    const balanceInCents = formData.balanceInCents;

    const limitInCents =
      formData.limitInCents > 0 ? formData.limitInCents : undefined;

    let dueDate: number | undefined;
    if (formData.type === "credit") {
      // Validação de data (só se for crédito)
      dueDate = parseInt(formData.dueDate);
      if (isNaN(dueDate) || dueDate < 1 || dueDate > 31) {
        toast({
          title: "Erro",
          description: "Data de vencimento inválida (1-31)",
          variant: "destructive",
        });
        return;
      }
    }

    let closingDate: number | undefined;
    if (formData.type === "credit") {
      // Validação de data (só se for crédito)
      closingDate = parseInt(formData.closingDate);
      if (isNaN(closingDate) || closingDate < 1 || closingDate > 31) {
        toast({
          title: "Erro",
          description: "Data de fechamento inválida (1-31)",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await handleAddAccount({
        name: formData.name,
        type: formData.type as any,
        balance: balanceInCents,
        limit_amount: limitInCents,
        due_date: dueDate,
        closing_date: closingDate,
        color: formData.color,
      } as any);

      // Reset form
      setFormData({
        name: "",
        type: "" as "checking" | "savings" | "credit" | "investment" | "meal_voucher" | "",
        balanceInCents: 0,
        limitInCents: 0,
        dueDate: "",
        closingDate: "",
        color: PREDEFINED_COLORS[0],
      });

      onOpenChange(false);
    } catch {
      // Erro já tratado no hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md sm:max-w-lg md:max-w-xl">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-headline">
            Adicionar Conta
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Nome da Conta */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-caption">
              Nome da Conta
            </Label>
            <Input
              id="name"
              placeholder="Ex: Conta Corrente, Cartão Nubank..."
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="h-10 sm:h-11"
            />
          </div>

          {/* Tipo de Conta */}
          <div className="space-y-2">
            <Label htmlFor="type" className="text-caption">
              Tipo de Conta
            </Label>
            <Select
              value={formData.type}
              onValueChange={(
                value: "checking" | "savings" | "credit" | "investment" | "meal_voucher"
              ) => setFormData((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="h-10 sm:h-11">
                <SelectValue placeholder="Selecione o tipo de conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">
                  {ACCOUNT_TYPE_LABELS.checking}
                </SelectItem>
                <SelectItem value="savings">
                  {ACCOUNT_TYPE_LABELS.savings}
                </SelectItem>
                <SelectItem value="credit">
                  {ACCOUNT_TYPE_LABELS.credit}
                </SelectItem>
                <SelectItem value="investment">
                  {ACCOUNT_TYPE_LABELS.investment}
                </SelectItem>
                <SelectItem value="meal_voucher">
                  {ACCOUNT_TYPE_LABELS.meal_voucher}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Saldo Inicial */}
          <div className="space-y-2">
            <Label className="text-caption">Saldo Inicial</Label>
            <CurrencyInput
              value={formData.balanceInCents}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, balanceInCents: value || 0 }))
              }
              allowNegative
            />
          </div>

          {/* Limite da Conta */}
          <div className="space-y-2">
            <Label className="text-caption">
              {formData.type === "credit" 
                ? "Limite do Cartão" 
                : formData.type === "checking" 
                ? "Limite de Cheque Especial" 
                : "Limite"}
            </Label>
            <CurrencyInput
              value={formData.limitInCents || 0}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, limitInCents: value || 0 }))
              }
            />
            {formData.type === "checking" && (
              <p className="text-caption text-muted-foreground">
                Informe o limite de cheque especial disponível na conta
              </p>
            )}
            {formData.type === "credit" && (
              <p className="text-caption text-muted-foreground">
                Limite total disponível no cartão de crédito
              </p>
            )}
          </div>

          {/* Campos específicos para Cartão de Crédito */}
          {formData.type === "credit" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {/* --- CORREÇÃO: Rótulo removido (opcional) --- */}
                <Label htmlFor="closingDate" className="text-caption">
                  Data de Fechamento
                </Label>
                <Input
                  id="closingDate"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 15"
                  value={formData.closingDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      closingDate: e.target.value,
                    }))
                  }
                  className="h-10 sm:h-11"
                />
                <p className="text-caption text-muted-foreground">
                  Dia do mês em que a fatura fecha
                </p>
              </div>

              <div className="space-y-2">
                {/* --- CORREÇÃO: Rótulo removido (opcional) --- */}
                <Label htmlFor="dueDate" className="text-caption">
                  Data de Vencimento
                </Label>
                <Input
                  id="dueDate"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 20"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      dueDate: e.target.value,
                    }))
                  }
                  className="h-10 sm:h-11"
                />
                <p className="text-caption text-muted-foreground">
                  Dia do mês em que a fatura vence
                </p>
              </div>
            </div>
          )}

          {/* Seleção de Cor */}
          <ColorPicker
            value={formData.color}
            onChange={handleColorChange}
            label="Cor da Conta"
          />

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-10 sm:h-11 text-body"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-10 sm:h-11 text-body"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Adicionando..." : "Adicionar Conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}