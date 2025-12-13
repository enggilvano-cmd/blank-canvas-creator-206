import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type EditScope = "current" | "current-and-remaining" | "all";

interface TransactionScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScopeSelected: (scope: EditScope) => void;
  currentInstallment?: number;
  totalInstallments?: number;
  isFixed?: boolean;
  mode?: "edit" | "delete";
  hasCompleted?: boolean;
  pendingCount?: number;
}

export function TransactionScopeDialog({
  open,
  onOpenChange,
  onScopeSelected,
  currentInstallment = 1,
  totalInstallments = 1,
  isFixed = false,
  mode = "edit",
  hasCompleted = false,
  pendingCount = 0,
}: TransactionScopeDialogProps) {
  const handleScopeSelection = (scope: EditScope) => {
    onScopeSelected(scope);
    onOpenChange(false);
  };

  const isDelete = mode === "delete";

  // Textos para transações fixas
  if (isFixed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isDelete ? "Escolher escopo da exclusão" : "Escolher escopo da edição"}
            </DialogTitle>
            <DialogDescription>
              {isDelete 
                ? "Defina se deseja excluir apenas esta ocorrência ou toda a série de transações fixas."
                : "Defina se deseja editar apenas esta ocorrência ou toda a série de transações fixas."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-4">
            <Button 
              variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("current")}
            >
              <div className="text-left">
                <div className="font-medium">Apenas Esta Ocorrência</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? "Excluir apenas esta transação específica"
                    : "Editar apenas esta transação específica"
                  }
                </div>
              </div>
            </Button>

            <Button 
              variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("current-and-remaining")}
            >
              <div className="text-left">
                <div className="font-medium">Esta e Próximas Ocorrências</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? `Excluir esta e todas as futuras (${pendingCount > 0 ? `${pendingCount} pendentes` : 'transações adicionais'})`
                    : `Editar esta e todas as futuras (${pendingCount > 0 ? `${pendingCount} pendentes` : 'transações adicionais'})`
                  }
                </div>
              </div>
            </Button>

            <Button 
              variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("all")}
            >
              <div className="text-left">
                <div className="font-medium">Todas as Ocorrências</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? "Excluir toda a série de transações fixas"
                    : "Editar toda a série de transações fixas"
                  }
                </div>
              </div>
            </Button>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Textos para transações parceladas
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? "Excluir Transação Parcelada" : "Editar Transação Parcelada"}
          </DialogTitle>
          <DialogDescription>
            {isDelete 
              ? "Escolha o escopo da exclusão para esta transação parcelada."
              : "Escolha o escopo da edição para esta transação parcelada."
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 pt-4">
          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("current")}
          >
            <div className="text-left">
              <div className="font-medium">Apenas Esta Parcela</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Excluir apenas a parcela ${currentInstallment} de ${totalInstallments}`
                  : `Editar apenas a parcela ${currentInstallment} de ${totalInstallments}`
                }
              </div>
            </div>
          </Button>

          {currentInstallment < totalInstallments && (
            <Button 
              variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("current-and-remaining")}
            >
              <div className="text-left">
                <div className="font-medium">Esta e Próximas Parcelas</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? `Excluir da parcela ${currentInstallment} até a ${totalInstallments} (${pendingCount > 0 ? `${pendingCount} pendentes` : 'restantes'})`
                    : `Editar da parcela ${currentInstallment} até a ${totalInstallments} (${pendingCount > 0 ? `${pendingCount} pendentes` : 'restantes'})`
                  }
                </div>
              </div>
            </Button>
          )}

          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={() => handleScopeSelection("all")}
          >
            <div className="text-left">
              <div className="font-medium">Todas as Parcelas</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Excluir todas as ${totalInstallments} parcelas`
                  : `Editar todas as ${totalInstallments} parcelas`
                }
              </div>
            </div>
          </Button>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
