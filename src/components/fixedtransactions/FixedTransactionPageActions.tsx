import { Button } from "@/components/ui/button";
import { Plus, Upload, Download } from "lucide-react";

interface FixedTransactionPageActionsProps {
  onImport: () => void;
  onExport: () => void;
  onAdd: () => void;
  hasTransactions: boolean;
}

export function FixedTransactionPageActions({
  onImport,
  onExport,
  onAdd,
  hasTransactions,
}: FixedTransactionPageActionsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 w-full md:grid-cols-3 lg:flex lg:flex-nowrap lg:gap-2 lg:w-auto lg:ml-auto">
        <Button
          variant="outline"
          onClick={onImport}
          className="gap-1.5 apple-interaction h-9 text-body px-3"
        >
          <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Importar</span>
        </Button>
        <Button
          variant="outline"
          onClick={onExport}
          className="gap-1.5 apple-interaction h-9 text-body px-3"
          disabled={!hasTransactions}
        >
          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Exportar</span>
        </Button>
        <Button
          onClick={onAdd}
          variant="outline"
          className="gap-1.5 apple-interaction h-9 text-body col-span-2 md:col-span-1 border-warning text-warning hover:bg-warning hover:text-warning-foreground px-3"
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Adicionar Transação Fixa</span>
        </Button>
      </div>
    </div>
  );
}
