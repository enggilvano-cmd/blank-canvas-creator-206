import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { DatePicker } from "@/components/ui/date-picker";

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
  const [amount, setAmount] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");

  // Quando o modal abre, pré-preenche os valores
  useEffect(() => {
    if (open && transaction) {
      setDate(new Date());
      // Formatar com vírgula (padrão brasileiro)
      // transaction.amount já está em reais (DECIMAL no banco)
      const formattedAmount = Math.abs(transaction.amount)
        .toFixed(2)
        .replace(".", ",");
      setAmount(formattedAmount);
      setAccountId(transaction.account_id);
    }
  }, [open, transaction]);

  const handleConfirm = () => {
    if (!transaction || !accountId) return;
    
    // Converter vírgula para ponto antes de parseFloat
    // Manter em reais (não multiplicar por 100)
    const amountInReais = parseFloat(amount.replace(",", "."));
    onConfirm(transaction.id, date, amountInReais, accountId);
    onOpenChange(false);
  };

  const handleAmountChange = (value: string) => {
    // Permitir apenas números e vírgula (padrão brasileiro)
    const sanitized = value.replace(/[^\d,]/g, "");
    // Garantir apenas uma vírgula
    const parts = sanitized.split(",");
    const formatted = parts.length > 2 
      ? parts[0] + "," + parts.slice(1).join("")
      : sanitized;
    setAmount(formatted);
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
            <Input
              id="amount"
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!accountId || !amount || parseFloat(amount.replace(",", ".")) <= 0}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
