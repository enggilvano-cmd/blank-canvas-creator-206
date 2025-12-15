import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput } from "@/components/forms/CurrencyInput";

import { ACCOUNT_TYPE_LABELS } from '@/types';
import { MarkAsPaidModalProps } from '@/types/formProps';

export function MarkAsPaidModal({
  open,
  onOpenChange,
  transaction,
  accounts,
  onConfirm,
}: MarkAsPaidModalProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [amount, setAmount] = useState<number>(0); // Em centavos
  const [accountId, setAccountId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quando o modal abre, pré-preenche os valores
  useEffect(() => {
    if (open && transaction) {
      setDate(new Date());
      // transaction.amount já está em centavos
      setAmount(Math.abs(transaction.amount));
      setAccountId(transaction.account_id);
      setIsSubmitting(false);  // ⚠️ Reset isSubmitting ao abrir modal
    }
  }, [open, transaction]);

  const handleConfirm = () => {
    // ⚠️ CRÍTICO: Evitar submissões duplicadas
    if (isSubmitting) {
      return;
    }
    
    if (!transaction || !accountId) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Amount já está em centavos (valor do CurrencyInput)
      onConfirm(transaction.id, date, amount, accountId);
      onOpenChange(false);
    } finally {
      // ⚠️ CRÍTICO: Sempre resetar isSubmitting
      setIsSubmitting(false);
    }
  };

  const handleAmountChange = (value: number) => {
    // CurrencyInput já retorna o valor em centavos
    setAmount(value);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Marcar como Pago</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Data */}
          <div className="grid gap-2">
            <Label htmlFor="date" className="text-caption">Data</Label>
            <DatePicker
              date={date}
              onDateChange={(newDate) => newDate && setDate(newDate)}
              placeholder="Selecione uma data"
            />
          </div>

          {/* Valor */}
          <div className="grid gap-2">
            <Label htmlFor="amount" className="text-caption">Valor</Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onValueChange={handleAmountChange}
              className="h-10 sm:h-11"
            />
          </div>

          {/* Conta */}
          <div className="grid gap-2">
            <Label htmlFor="account" className="text-caption">Conta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: account.color || "#6b7280" }}
                        />
                        <span>{account.name}</span>
                      </div>
                      <span className="ml-2 text-caption text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!accountId || amount <= 0 || isSubmitting}
          >
            {isSubmitting ? "Processando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
