import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { getTodayString, createDateFromString } from "@/lib/dateUtils";
import { getAvailableBalance } from "@/lib/formatters";
import { CurrencyInput } from "./forms/CurrencyInput";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { creditPaymentSchema } from "@/lib/validationSchemas";
import { z } from "zod";
import { CreditPaymentModalProps } from "@/types/formProps";
import { useBalanceValidation } from "@/hooks/useBalanceValidation";
import { DatePicker } from "@/components/ui/date-picker";

// Helper para formatar moeda (R$)
const formatBRL = (valueInCents: number) => {
  // Converte centavos (ex: 12345) para Reais (123.45)
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100); 
};

export function CreditPaymentModal({
  open,
  onOpenChange,
  onPayment,
  creditAccount,
  invoiceValueInCents = 0,
  nextInvoiceValueInCents = 0,
  // BUGFIX: Usar a prop da dívida total
  totalDebtInCents: totalDebtInCentsProp = 0,
  invoiceMonth, 
}: CreditPaymentModalProps) {
  const [formData, setFormData] = useState({
    bankAccountId: "",
    amountInCents: 0,
    paymentType: "invoice" as "invoice" | "total_balance" | "partial",
    date: getTodayString(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { accounts: allAccounts = [] } = useAccounts();
  
  const bankAccounts = useMemo(
    () => allAccounts.filter((acc) => acc.type !== "credit"),
    [allAccounts]
  );

  // ✅ BUGFIX P0: Hook deve ser chamado no top level, não dentro de handler condicional
  const selectedBankAccount = useMemo(
    () => allAccounts.find((acc) => acc.id === formData.bankAccountId),
    [allAccounts, formData.bankAccountId]
  );

  const balanceValidation = useBalanceValidation({
    account: selectedBankAccount,
    amountInCents: formData.amountInCents,
    transactionType: 'expense',
  });

  // Normalização: garantir valores positivos em centavos
  const normalizeCents = (v: number) => Math.max(0, Math.abs(v || 0));
  const invoiceValueNorm = normalizeCents(invoiceValueInCents);
  const nextInvoiceValueNorm = normalizeCents(nextInvoiceValueInCents);
  const totalDebtNorm = normalizeCents(totalDebtInCentsProp);

  useEffect(() => {
    if (open) {
      let initialAmount = 0;
      let initialPaymentType: "invoice" | "total_balance" | "partial" = "partial";

      if (invoiceValueNorm > 0) {
        initialAmount = invoiceValueNorm;
        initialPaymentType = "invoice";
      } else if (totalDebtNorm > 0) {
        initialAmount = totalDebtNorm;
        initialPaymentType = "total_balance";
      }

      setFormData({
        bankAccountId: "",
        amountInCents: initialAmount,
        paymentType: initialPaymentType,
        date: getTodayString(),
      });
    }
  }, [open, invoiceValueNorm, totalDebtNorm]); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!creditAccount) return;
    
    // Validação com Zod
    try {
      const validationData = {
        creditCardAccountId: creditAccount.id,
        debitAccountId: formData.bankAccountId,
        amount: formData.amountInCents,
        paymentDate: formData.date,
      };

      creditPaymentSchema.parse(validationData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast({
          title: "Erro de validação",
          description: firstError.message,
          variant: "destructive",
        });
        logger.error("Validation errors:", error.errors);
        return;
      }
    }

    const { amountInCents } = formData;

    // ✅ BUGFIX P0: Usar validação já calculada no top level
    if (selectedBankAccount && !balanceValidation.isValid) {
      const limitText = selectedBankAccount.limit_amount
        ? ` (incluindo limite de ${formatBRL(selectedBankAccount.limit_amount)})`
        : "";
      toast({
        title: "Saldo Insuficiente",
        description: `A conta ${selectedBankAccount.name} não possui saldo suficiente${limitText}.`,
        variant: "destructive",
      });
      return;
    }

    // Validação contra a dívida total normalizada (valor absoluto)
    const totalDebtInCents = totalDebtNorm;
    
    // Permite pagamento maior que a fatura atual, mas não maior que dívida total + pequena margem
    // Margem de 100 centavos (R$ 1,00) para erros de arredondamento
    if (amountInCents > totalDebtInCents + 100) { 
      toast({
        title: "Valor Inválido",
        description: `O valor ${formatBRL(amountInCents)} é maior que a dívida total de ${formatBRL(totalDebtInCents)}. Para pagar mais, o valor excedente será tratado como crédito a favor.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onPayment({
        creditCardAccountId: creditAccount.id,
        debitAccountId: formData.bankAccountId,
        amount: amountInCents / 100,
        paymentDate: formData.date,
        invoiceMonth,
      });

      toast({
        title: "Sucesso",
        description: "Pagamento realizado com sucesso",
        variant: "default",
      });
      onOpenChange(false);
    } catch (error) {
      logger.error("Payment failed:", error);
      toast({
        title: "Erro",
        description: `Falha ao processar o pagamento. ${error instanceof Error ? error.message : ''}`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Exibição: dívida total normalizada (valor absoluto)
  const totalDebtInCents = totalDebtNorm;

  const handlePaymentTypeChange = (
    type: "invoice" | "total_balance" | "partial"
  ) => {
    setFormData((prev) => {
      let newAmountInCents = prev.amountInCents; 

      if (type === "invoice") {
        newAmountInCents = invoiceValueNorm;
      } else if (type === "total_balance") {
        newAmountInCents = totalDebtNorm;
      }
      // Se 'partial', mantém o valor que o usuário digitou
      
      return {
        ...prev,
        paymentType: type,
        amountInCents: newAmountInCents,
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-visible">
        <DialogHeader>
          <DialogTitle>Pagar Fatura do Cartão</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {creditAccount && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h3 className="font-semibold">{creditAccount.name}</h3>
              <div className="text-sm space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Fatura Fechada:</span>
                  <span className="font-medium balance-negative">
                    {formatBRL(invoiceValueNorm)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Fatura Aberta:</span>
                  <span className="font-medium text-muted-foreground">
                    {formatBRL(nextInvoiceValueNorm)}
                  </span>
                </p>
                <p className="flex justify-between text-base font-semibold border-t pt-1 mt-1">
                  <span className="text-foreground">Dívida Total:</span>
                  <span className="balance-negative">
                    {formatBRL(totalDebtInCents)}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bankAccount">Conta para Pagamento</Label>
            <Select
              value={formData.bankAccountId}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, bankAccountId: value }));
              }}
            >
              <SelectTrigger id="bankAccount" className="h-auto">
                <SelectValue placeholder="Selecione a conta">
                  {formData.bankAccountId && (() => {
                    const selectedAccount = bankAccounts.find((acc) => acc.id === formData.bankAccountId);
                    if (!selectedAccount) return null;
                    const hasLimit = selectedAccount.limit_amount && selectedAccount.limit_amount > 0;
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
                        </div>
                        <div className="text-caption text-muted-foreground pl-5">
                          {formatBRL(selectedAccount.balance)}
                          {hasLimit && (
                            <span className="text-primary font-semibold"> + {formatBRL(selectedAccount.limit_amount || 0)} limite</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {bankAccounts.length === 0 ? (
                  <div className="px-2 py-6 text-sm text-muted-foreground text-center">
                    Nenhuma conta disponível
                  </div>
                ) : (
                  bankAccounts.map((account) => {
                    const hasLimit = account.limit_amount && account.limit_amount > 0;
                    return (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex items-center gap-2 w-full">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: account.color || "#6b7280" }}
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-medium truncate text-body">{account.name}</span>
                            <span className="text-caption text-muted-foreground">
                              {formatBRL(account.balance)}
                              {hasLimit && (
                                <span className="text-primary ml-1">
                                  + {formatBRL(account.limit_amount || 0)} limite
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Tipo de Pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={formData.paymentType === "invoice" ? "default" : "outline"}
                onClick={() => handlePaymentTypeChange("invoice")}
                className="h-auto p-2 flex-col"
                disabled={invoiceValueInCents <= 0}
              >
                <span className="font-medium text-xs">Pagar Fatura</span>
                <span className="text-xs text-muted-foreground">
                  {formatBRL(invoiceValueInCents)}
                </span>
              </Button>
              <Button
                type="button"
                variant={
                  formData.paymentType === "total_balance" ? "default" : "outline"
                }
                onClick={() => handlePaymentTypeChange("total_balance")}
                className="h-auto p-2 flex-col"
                disabled={totalDebtInCents <= 0}
              >
                <span className="font-medium text-xs">Pagar Total</span>
                <span className="text-xs text-muted-foreground">
                  {formatBRL(totalDebtInCents)}
                </span>
              </Button>
              <Button
                type="button"
                variant={formData.paymentType === "partial" ? "default" : "outline"}
                onClick={() => handlePaymentTypeChange("partial")}
                className="h-auto p-2 flex-col"
              >
                <span className="font-medium text-xs">Outro Valor</span>
                <span className="text-xs text-muted-foreground">
                  Manual
                </span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor do Pagamento</Label>
              <CurrencyInput
                id="amount"
                value={formData.amountInCents}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    amountInCents: value,
                    paymentType: "partial",
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data do Pagamento</Label>
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
            </div>
          </div>

          {bankAccounts.length === 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Atenção:</strong> Você precisa ter pelo menos uma conta bancária cadastrada.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={bankAccounts.length === 0 || isSubmitting || formData.amountInCents <= 0}
            >
              {isSubmitting ? "Processando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}