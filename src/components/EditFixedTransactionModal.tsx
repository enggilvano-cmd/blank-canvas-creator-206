import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import { createDateFromString } from "@/lib/dateUtils";
import { EditTransactionFormFields } from "./edit-transaction/EditTransactionFormFields";

import { Transaction, Account } from "@/types";

interface EditFixedTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditTransaction: (transaction: Transaction) => void;
  transaction: Transaction;
  accounts: Account[];
  hideStatusAndInvoice?: boolean;
}

export function EditFixedTransactionModal({
  open,
  onOpenChange,
  onEditTransaction,
  transaction,
  accounts,
  hideStatusAndInvoice = false,
}: EditFixedTransactionModalProps) {
  const [formData, setFormData] = useState({
    description: "",
    amountInCents: 0,
    date: new Date(),
    type: "income" as "income" | "expense",
    category_id: "",
    account_id: "",
    status: "pending" as "pending" | "completed",
    invoiceMonth: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { categories } = useCategories();

  useEffect(() => {
    if (open && transaction) {
      const dateObj = typeof transaction.date === 'string' 
        ? createDateFromString(transaction.date) 
        : transaction.date;

      // transaction.amount vem em REAIS do banco, converter para CENTAVOS
      const amountInReais = Math.abs(Number(transaction.amount));
      const amountInCents = Math.round(amountInReais * 100);

      setFormData({
        description: transaction.description,
        amountInCents: amountInCents,
        date: dateObj,
        type: transaction.type as "income" | "expense",
        category_id: transaction.category_id || "",
        account_id: transaction.account_id,
        status: "pending", // Fixed transactions don't have status in definition, default to pending
        invoiceMonth: transaction.invoice_month || "",
      });
    }
  }, [open, transaction]);

  const filteredCategories = useMemo(() => {
    if (!formData.type) return [];
    const filtered = categories.filter(
      (cat) => cat.type === formData.type || cat.type === "both"
    );
    return filtered;
  }, [categories, formData.type, formData.category_id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ⚠️ CRÍTICO: Evitar submissões duplicadas
    if (isSubmitting) {
      return;
    }
    
    setIsSubmitting(true);

    if (!formData.description.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, preencha a descrição.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (formData.amountInCents <= 0) {
      toast({
        title: "Valor inválido",
        description: "O valor deve ser maior que zero.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.account_id) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, selecione uma conta.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // Lógica para preservar mês e ano da transação original, alterando apenas o dia
      const originalDateObj = typeof transaction.date === 'string' 
        ? createDateFromString(transaction.date) 
        : transaction.date;

      const year = originalDateObj.getFullYear();
      const month = String(originalDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(formData.date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Ensure amount has correct sign based on type
      // formData.amountInCents está em CENTAVOS, converter para REAIS
      let finalAmountInCents = formData.amountInCents;
      if (formData.type === "expense") {
        finalAmountInCents = -Math.abs(finalAmountInCents);
      } else {
        finalAmountInCents = Math.abs(finalAmountInCents);
      }
      
      // Converter centavos → reais para enviar ao banco
      const finalAmountInReais = finalAmountInCents / 100;

    const transactionUpdate = {
      ...transaction, // Keep other fields
      description: formData.description,
      amount: finalAmountInReais,
      date: dateString,
      type: formData.type,
      category_id: formData.category_id || "",
      account_id: formData.account_id,
      is_fixed: true,
    };

    // Só adiciona invoice_month se tiver valor (não vazio)
    if (formData.invoiceMonth && formData.invoiceMonth.trim() !== '') {
      transactionUpdate.invoice_month = formData.invoiceMonth;
      transactionUpdate.invoice_month_overridden = true;
    } else {
      transactionUpdate.invoice_month = undefined;
      transactionUpdate.invoice_month_overridden = false;
    }
    
      onEditTransaction(transactionUpdate);
    } finally {
      // ⚠️ CRÍTICO: Sempre resetar isSubmitting
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Editar Transação Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="text-body font-medium">
              Transação Fixa
            </div>
          </div>

          <EditTransactionFormFields
            formData={formData}
            onFormDataChange={(updates) => setFormData({ ...formData, ...updates })}
            accounts={accounts}
            filteredCategories={filteredCategories}
            isTransfer={false}
            hideStatusAndInvoice={hideStatusAndInvoice}
          />

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 text-body"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 text-body">
              {isSubmitting ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
