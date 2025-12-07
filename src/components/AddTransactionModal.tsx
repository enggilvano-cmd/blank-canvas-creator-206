import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AddTransactionModalProps } from "@/types/formProps";
import { useAddTransactionForm } from "@/hooks/useAddTransactionForm";
import { TransactionFormFields } from "./add-transaction/TransactionFormFields";
import { AccountCategoryFields } from "./add-transaction/AccountCategoryFields";
import { InvoiceMonthSelector } from "./add-transaction/InvoiceMonthSelector";
import { InstallmentOptions } from "./add-transaction/InstallmentOptions";

export function AddTransactionModal({
  open,
  onOpenChange,
  onAddTransaction,
  onAddInstallmentTransactions,
  onSuccess,
  accounts,
  initialType = "",
  initialAccountType = "",
  lockType = false,
}: AddTransactionModalProps) {
  const filteredAccounts = initialAccountType === "credit"
    ? accounts.filter((acc) => acc.type === "credit")
    : initialAccountType === "checking"
    ? accounts.filter((acc) => acc.type !== "credit")
    : accounts;

  const {
    formData,
    setFormData,
    customInstallments,
    setCustomInstallments,
    validationErrors,
    filteredCategories,
    selectedAccount,
    handleSubmit,
    setManualStatusChange,
    setManualInvoiceMonthChange,
  } = useAddTransactionForm({
    open,
    initialType,
    accounts: filteredAccounts,
    onAddTransaction,
    onAddInstallmentTransactions,
    onSuccess,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">
            {initialType === "income" 
              ? "Adicionar Receita"
              : initialType === "expense" 
              ? "Adicionar Despesa"
              : "Adicionar Transação"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <TransactionFormFields
            description={formData.description}
            type={formData.type}
            amount={formData.amount}
            date={formData.date}
            status={formData.status}
            lockType={lockType}
            hideType={lockType}
            validationErrors={validationErrors}
            onDescriptionChange={(value) =>
              setFormData((prev) => ({ ...prev, description: value }))
            }
            onTypeChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                type: value,
                category_id: "",
              }))
            }
            onAmountChange={(value) =>
              setFormData((prev) => ({ ...prev, amount: value }))
            }
            onDateChange={(value) =>
              setFormData((prev) => ({ ...prev, date: value }))
            }
            onStatusChange={(value) => {
              setManualStatusChange(true);
              setFormData((prev) => ({
                ...prev,
                status: value as "pending" | "completed",
              }));
            }}
          />

          <AccountCategoryFields
            accountId={formData.account_id}
            categoryId={formData.category_id}
            type={formData.type}
            accounts={filteredAccounts}
            categories={filteredCategories}
            validationErrors={validationErrors}
            onAccountChange={(value) =>
              setFormData((prev) => ({ ...prev, account_id: value }))
            }
            onCategoryChange={(value) => {
              const selectedCategory = filteredCategories.find(c => c.id === value);
              setFormData((prev) => {
                let newType = prev.type;
                if (!newType && selectedCategory && selectedCategory.type !== 'both') {
                  newType = selectedCategory.type as "income" | "expense";
                }
                return { ...prev, category_id: value, type: newType };
              });
            }}
          />

          {formData.account_id && selectedAccount?.type === "credit" && (
            <InvoiceMonthSelector
              invoiceMonth={formData.invoiceMonth}
              onInvoiceMonthChange={(value) => {
                setManualInvoiceMonthChange(true);
                setFormData((prev) => ({ ...prev, invoiceMonth: value }));
              }}
            />
          )}

          <InstallmentOptions
            isInstallment={formData.isInstallment}
            installments={formData.installments}
            customInstallments={customInstallments}
            amount={formData.amount}
            isFixed={formData.isFixed}
            onInstallmentChange={(checked: boolean) =>
              setFormData((prev) => ({
                ...prev,
                isInstallment: checked,
              }))
            }
            onInstallmentsChange={(value) => {
              setFormData((prev) => ({ ...prev, installments: value }));
            }}
            onCustomInstallmentsChange={setCustomInstallments}
          />

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 text-body"
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 text-body">
              Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
