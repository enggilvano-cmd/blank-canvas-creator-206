import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import { TransactionScopeDialog, EditScope } from "./TransactionScopeDialog";
import { FixedTransactionScopeDialog, FixedScope } from "./FixedTransactionScopeDialog";
import { EditTransactionModalProps } from "@/types/formProps";
import { TransactionUpdate } from "@/types";
import { useEditTransactionScope } from "@/hooks/edit-transaction/useEditTransactionScope";
import { useEditTransactionForm } from "@/hooks/edit-transaction/useEditTransactionForm";
import { EditTransactionFormFields } from "./edit-transaction/EditTransactionFormFields";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function EditTransactionModal({
  open,
  onOpenChange,
  onEditTransaction,
  transaction,
  accounts
}: EditTransactionModalProps) {
  const { toast } = useToast();
  const { categories } = useCategories();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Detectar se é uma transação de transferência
  const isTransfer = Boolean(transaction?.to_account_id || transaction?.linked_transaction_id);
  
  const {
    scopeDialogOpen,
    setScopeDialogOpen,
    pendingTransactionsCount,
    hasCompletedTransactions,
    isInstallment,
    isFixed,
    checkScopeRequired,
  } = useEditTransactionScope(transaction);

  const {
    formData,
    setFormData,
    validateForm,
    getUpdates,
  } = useEditTransactionForm(transaction, accounts, open, isTransfer);

  const [fixedSequence, setFixedSequence] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    async function loadSequence() {
      if (isFixed && transaction) {
        const parentId = transaction.parent_transaction_id || transaction.id;
        const { data } = await supabase
          .from('transactions')
          .select('id, date')
          .or(`id.eq.${parentId},parent_transaction_id.eq.${parentId}`)
          .order('date', { ascending: true });
        
        if (data) {
          // Ordenação secundária por ID para garantir consistência em datas iguais
          const sortedData = data.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA === dateB) {
              return a.id.localeCompare(b.id);
            }
            return dateA - dateB;
          });

          const index = sortedData.findIndex(t => t.id === transaction.id);
          setFixedSequence({
            current: index !== -1 ? index + 1 : 1,
            total: sortedData.length
          });
        }
      } else {
        setFixedSequence(null);
      }
    }
    loadSequence();
  }, [isFixed, transaction, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ⚠️ CRÍTICO: Evitar submissões duplicadas ao clicar múltiplas vezes
    if (isSubmitting) {
      return;
    }
    
    setIsSubmitting(true);
    
    if (!transaction) {
      setIsSubmitting(false);
      return;
    }
    
    if (!await validateForm()) {
      setIsSubmitting(false);
      return;
    }
    
    const requiresScope = await checkScopeRequired();
    if (requiresScope) {
      setScopeDialogOpen(true);
      setIsSubmitting(false);
      return;
    }

    processEdit("current");
  };

  const processEdit = async (editScope: EditScope) => {
    if (!transaction) {
      setIsSubmitting(false);
      return;
    }

    try {
      const updates = getUpdates();
      if (!updates) {
        onOpenChange(false);
        return;
      }

      onEditTransaction({ id: transaction.id, ...updates } as TransactionUpdate, editScope);
      
      const scopeDescription = editScope === "current" ? "Transação atual atualizada com sucesso" : 
                               editScope === "all" ? "Todas as parcelas atualizadas com sucesso" :
                               "Parcelas selecionadas atualizadas com sucesso";
      
      toast({
        title: "Sucesso",
        description: scopeDescription,
      });

      onOpenChange(false);
      setScopeDialogOpen(false);
    } finally {
      // ⚠️ CRÍTICO: Sempre resetar isSubmitting
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(cat => 
    cat.type === formData.type || cat.type === "both"
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-headline">
              Editar Transação
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isInstallment && (
              <div className="space-y-2">
                <div className="text-body font-medium">
                  Parcela {transaction?.current_installment} de {transaction?.installments}
                </div>
              </div>
            )}
            {isFixed && fixedSequence && (
              <div className="space-y-2">
                <div className="text-body font-medium">
                  Parcela {fixedSequence.current} de {fixedSequence.total}
                </div>
              </div>
            )}
            <EditTransactionFormFields
              formData={formData}
              onFormDataChange={(updates) => setFormData({ ...formData, ...updates })}
              accounts={accounts}
              filteredCategories={filteredCategories}
              isTransfer={isTransfer}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1 text-body">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 text-body">
                {isSubmitting ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {isFixed && (
        <FixedTransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={(scope: FixedScope) => {
            const editScope: EditScope =
              scope === "current"
                ? "current"
                : scope === "current-and-remaining"
                  ? "current-and-remaining"
                  : "all";
            processEdit(editScope);
          }}
          mode="edit"
          hasCompleted={hasCompletedTransactions}
          pendingCount={pendingTransactionsCount}
        />
      )}

      {!isFixed && isInstallment && (
        <TransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={processEdit}
          currentInstallment={transaction?.current_installment || 1}
          totalInstallments={transaction?.installments || 1}
          mode="edit"
          hasCompleted={hasCompletedTransactions}
          pendingCount={pendingTransactionsCount}
        />
      )}
    </>
  );
}
