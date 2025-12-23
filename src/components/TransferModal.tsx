import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDateFromString, getTodayString } from "@/lib/dateUtils";
import { CurrencyInput } from "./forms/CurrencyInput";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { getErrorMessage } from "@/types/errors";
import { ArrowRight } from "lucide-react";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { logger } from "@/lib/logger";
import { transferSchema } from "@/lib/validationSchemas";
import { TransferModalProps } from "@/types/formProps";
import { useBalanceValidation, validateCreditLimitForAdd } from "@/hooks/useBalanceValidation";
import { DatePicker } from "@/components/ui/date-picker";

export function TransferModal({ open, onOpenChange, onTransfer }: TransferModalProps) {
  const { accounts } = useAccounts();
  const [formData, setFormData] = useState({
    fromAccountId: "",
    toAccountId: "",
    amountInCents: 0,
    date: getTodayString()
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Contas de origem podem ser qualquer tipo, exceto crédito.
  const sourceAccounts = useMemo(() => accounts.filter(acc => acc.type !== "credit"), [accounts]);
  
  // Contas de destino também não podem ser de crédito para evitar ambiguidade com pagamento de fatura.
  const destinationAccounts = useMemo(() => 
    accounts.filter(acc => acc.type !== "credit" && acc.id !== formData.fromAccountId), 
    [accounts, formData.fromAccountId]
  );

  // ✅ Validação de saldo movida para o top level (fora do handler)
  const fromAccount = sourceAccounts.find(acc => acc.id === formData.fromAccountId);
  // BUGFIX: O hook useBalanceValidation compara com account.balance que está em REAIS
  // mas amountInCents está em CENTAVOS, então precisamos converter para reais
  const balanceValidation = useBalanceValidation({
    account: fromAccount,
    amountInCents: formData.amountInCents / 100, // Converte centavos para reais
    transactionType: 'expense',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação Zod - ajustar nomes dos campos para corresponder ao schema
    const validationResult = transferSchema.safeParse({
      amount: formData.amountInCents,
      date: formData.date,
      from_account_id: formData.fromAccountId,
      to_account_id: formData.toAccountId,
    });

    if (!validationResult.success) {
      const error = validationResult.error;
      toast({
        title: "Erro de Validação",
        description: error.errors.map(e => e.message).join(", "),
        variant: "destructive",
      });
      logger.error("Validation errors:", error.errors);
      return;
    }

    // Validar saldo da conta de origem
    if (fromAccount) {
      // Para cartões de crédito, usar validação assíncrona que considera pending
      if (fromAccount.type === 'credit') {
        const validation = await validateCreditLimitForAdd(
          fromAccount,
          formData.amountInCents,
          'expense'
        );
        
        if (!validation.isValid) {
          toast({
            title: "Limite de Crédito Excedido",
            description: validation.errorMessage || `A conta ${fromAccount.name} não possui limite disponível.`,
            variant: "destructive"
          });
          return;
        }
      } else if (!balanceValidation.isValid) {
        // Para outras contas, usar validação síncrona
        const limitText = fromAccount.limit_amount 
          ? ` (incluindo limite de ${formatCurrency(fromAccount.limit_amount)})`
          : '';
        toast({
          title: "Saldo Insuficiente",
          description: `A conta ${fromAccount.name} não possui saldo suficiente${limitText}.`,
          variant: "destructive"
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // formData.amountInCents está em CENTAVOS (do CurrencyInput)
      // Converter para REAIS antes de enviar para a API
      const amountInReais = formData.amountInCents / 100;
      
      await onTransfer(
        // Uma transferência deve ser tratada no backend como duas transações atômicas:
        // 1. Uma despesa na conta de origem (fromAccountId)
        // 2. Uma receita na conta de destino (toAccountId)
        // Esta chamada única assume que o backend abstrai essa complexidade.
        formData.fromAccountId,
        formData.toAccountId,
        amountInReais,
        createDateFromString(formData.date)
      );

      toast({
        title: "Sucesso",
        description: "Transferência realizada com sucesso",
        variant: "default"
      });

      // Reset form
      setFormData({
        fromAccountId: "",
        toAccountId: "",
        amountInCents: 0,
        date: getTodayString()
      });

      onOpenChange(false);
    } catch (error: unknown) {
      // A função onTransfer deve lançar um erro em caso de falha para este bloco ser ativado.
      logger.error("Transfer failed:", error);
      toast({
        title: "Erro na Transferência",
        description: getErrorMessage(error) || "Não foi possível realizar a transferência. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Transferência entre Contas</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para realizar uma transferência entre contas.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromAccount" className="text-caption">Conta de Origem</Label>
              <Select value={formData.fromAccountId} onValueChange={(value) => setFormData(prev => ({ ...prev, fromAccountId: value }))}>
                <SelectTrigger className="h-auto">
                  <SelectValue placeholder="Selecione a conta de origem">
                    {formData.fromAccountId && (() => {
                      const selectedAccount = sourceAccounts.find((acc) => acc.id === formData.fromAccountId);
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
                            {formatCurrency(selectedAccount.balance * 100)}
                            {hasLimit && (
                              <span className="text-primary font-semibold"> + {formatCurrency(selectedAccount.limit_amount || 0)} limite</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...sourceAccounts].sort((a, b) => a.name.localeCompare(b.name)).map((account) => {
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
                                {formatCurrency(account.balance * 100)}
                                {hasLimit && (
                                  <span className="text-primary ml-1">
                                    + {formatCurrency(account.limit_amount || 0)} limite
                                  </span>
                                )}
                              </span>
                            </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-center">
              <div className="p-2 bg-muted rounded-full">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="toAccount" className="text-caption">Conta de Destino</Label>
              <Select value={formData.toAccountId} onValueChange={(value) => setFormData(prev => ({ ...prev, toAccountId: value }))}>
                <SelectTrigger className="h-auto">
                  <SelectValue placeholder="Selecione a conta de destino">
                    {formData.toAccountId && (() => {
                      const selectedAccount = destinationAccounts.find((acc) => acc.id === formData.toAccountId);
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
                            {formatCurrency(selectedAccount.balance * 100)}
                            {hasLimit && (
                              <span className="text-primary font-semibold"> + {formatCurrency(selectedAccount.limit_amount || 0)} limite</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...destinationAccounts]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((account) => {
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
                                {formatCurrency(account.balance * 100)}
                                {hasLimit && (
                                  <span className="text-primary ml-1">
                                    + {formatCurrency(account.limit_amount || 0)} limite
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-caption">Valor</Label>
              <CurrencyInput
                id="amount"
                value={formData.amountInCents}
                onValueChange={(value) => setFormData(prev => ({ ...prev, amountInCents: value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date" className="text-caption">Data</Label>
              <DatePicker
                date={formData.date ? createDateFromString(formData.date) : undefined}
                onDateChange={(newDate) => {
                  if (newDate) {
                    const year = newDate.getFullYear();
                    const month = String(newDate.getMonth() + 1).padStart(2, '0');
                    const day = String(newDate.getDate()).padStart(2, '0');
                    setFormData(prev => ({ ...prev, date: `${year}-${month}-${day}` }));
                  }
                }}
                placeholder="Selecione a data"
              />
            </div>
          </div>

          {sourceAccounts.length < 2 && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-body text-muted-foreground">
                <strong>Atenção:</strong> Você precisa ter pelo menos 2 contas (exceto cartão de crédito) para fazer transferências.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 text-body">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 text-body"
              disabled={
                sourceAccounts.length < 2 || 
                isSubmitting || 
                !formData.fromAccountId || 
                !formData.toAccountId || 
                formData.amountInCents <= 0
              }
            >
              {isSubmitting ? "Processando..." : "Realizar Transferência"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}