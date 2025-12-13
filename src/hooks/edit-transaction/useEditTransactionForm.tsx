import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Transaction, Account } from '@/types';
import { createDateFromString } from '@/lib/dateUtils';
import { logger } from '@/lib/logger';
import { editTransactionSchema } from '@/lib/validationSchemas';
import { z } from 'zod';


interface FormData {
  description: string;
  amountInCents: number;
  date: Date;
  type: "income" | "expense";
  category_id: string;
  account_id: string;
  status: "pending" | "completed";
  invoiceMonth: string;
}

export function useEditTransactionForm(
  transaction: Transaction | null,
  accounts: Account[],
  open: boolean,
  isTransfer: boolean = false
) {
  const [formData, setFormData] = useState<FormData>({
    description: "",
    amountInCents: 0,
    date: new Date(),
    type: "expense",
    category_id: "",
    account_id: "",
    status: "completed",
    invoiceMonth: "",
  });
  const [originalData, setOriginalData] = useState(formData);
  const { toast } = useToast();

  useEffect(() => {
    if (open && transaction) {
      const transactionDate = typeof transaction.date === 'string' ? 
        createDateFromString(transaction.date.split('T')[0]) : 
        transaction.date;
      
      const transactionType = transaction.type === "transfer" ? "expense" : transaction.type;
      
      const initialData: FormData = {
        description: transaction.description || "",
        amountInCents: Math.round(Math.abs(transaction.amount)),
        date: transactionDate,
        type: transactionType as "income" | "expense",
        category_id: transaction.category_id || "",
        account_id: transaction.account_id || "",
        status: transaction.status || "completed",
        invoiceMonth: transaction.invoice_month || "",
      };
      

      setFormData(initialData);
      setOriginalData(initialData);
    }
  }, [open, transaction, accounts]);

  const validateForm = async (): Promise<boolean> => {
    if (!transaction) return false;

    // Se for transferência, não validar descrição, tipo e categoria
    if (isTransfer) {
      return true;
    }

    try {
      const validationData = {
        id: transaction.id,
        description: formData.description,
        amount: formData.amountInCents,
        date: formData.date.toISOString().split('T')[0],
        type: formData.type,
        category_id: formData.category_id,
        account_id: formData.account_id,
        status: formData.status,
        invoiceMonth: formData.invoiceMonth,
      };

      editTransactionSchema.parse(validationData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast({
          title: "Erro de validação",
          description: firstError.message,
          variant: "destructive",
        });
        logger.error("Validation errors:", error.errors);
        return false;
      }
    }

    return true;
  };

  const getUpdates = (): Partial<Transaction> | null => {
    const updates: Partial<Transaction> = {};
    
    // Se for transferência, não permitir edição de descrição, tipo e categoria
    if (!isTransfer) {
      if (formData.description.trim() !== originalData.description.trim()) {
        updates.description = formData.description.trim();
      }
      
      if (formData.type !== originalData.type) {
        updates.type = formData.type;
      }
      
      if (formData.category_id !== originalData.category_id) {
        updates.category_id = formData.category_id;
      }
    }
    
    const typeChanged = !isTransfer && formData.type !== originalData.type;
    const amountChanged = formData.amountInCents !== originalData.amountInCents;

    if (amountChanged || typeChanged) {
      let finalAmount = formData.amountInCents;
      if (formData.type === "expense") {
        finalAmount = -Math.abs(finalAmount);
      } else {
        finalAmount = Math.abs(finalAmount);
      }
      updates.amount = finalAmount;
    }
    
    if (formData.date.getTime() !== originalData.date.getTime()) {
      updates.date = formData.date;
    }
    
    if (formData.account_id !== originalData.account_id) {
      updates.account_id = formData.account_id;
    }
    
    if (formData.status !== originalData.status) {
      updates.status = formData.status;
    }
    
    if (formData.invoiceMonth !== originalData.invoiceMonth) {
      updates.invoice_month = formData.invoiceMonth || undefined;
      updates.invoice_month_overridden = Boolean(formData.invoiceMonth);
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: "Aviso",
        description: "Nenhuma alteração foi detectada",
        variant: "default",
      });
      return null;
    }

    return updates;
  };

  return {
    formData,
    setFormData,
    validateForm,
    getUpdates,
  };
}
