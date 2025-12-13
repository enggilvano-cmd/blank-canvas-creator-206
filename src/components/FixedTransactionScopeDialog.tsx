import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type FixedScope = "current" | "current-and-remaining" | "all";

interface FixedTransactionScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScopeSelected: (scope: FixedScope) => void;
  mode?: "edit" | "delete";
  hasCompleted?: boolean;
  pendingCount?: number;
}

export function FixedTransactionScopeDialog({
  open,
  onOpenChange,
  onScopeSelected,
  mode = "edit",
  hasCompleted: _hasCompleted = false,
  pendingCount = 0,
}: FixedTransactionScopeDialogProps) {
  const handleScopeSelection = (scope: FixedScope) => {
    onScopeSelected(scope);
    onOpenChange(false);
  };

  const isDelete = mode === "delete";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? "Excluir Transação Fixa" : "Editar Transação Fixa"}
          </DialogTitle>
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
                  ? "Excluir apenas esta transação específica deste mês"
                  : "Editar apenas esta transação específica deste mês"
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
                  ? `Excluir esta e todas as futuras (${pendingCount} pendentes)`
                  : `Editar esta e todas as futuras (${pendingCount} pendentes)`
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
                  ? "Excluir todo o histórico e remover a recorrência fixa"
                  : "Editar todo o histórico e atualizar a recorrência fixa"
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
