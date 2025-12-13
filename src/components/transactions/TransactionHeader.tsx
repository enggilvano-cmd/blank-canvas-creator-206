import { Button } from "@/components/ui/button";
import { Plus, Upload, FileDown } from "lucide-react";

interface TransactionHeaderProps {
  onAddTransaction: () => void;
  onExport: () => void;
  onImport: () => void;
  isHeaderVersion?: boolean;
  hasTransactions?: boolean;
}

export const TransactionHeader = ({ onAddTransaction, onExport, onImport, isHeaderVersion = false, hasTransactions = true }: TransactionHeaderProps) => {
  if (isHeaderVersion) {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onImport}
          className="gap-1.5 apple-interaction h-8 text-xs"
        >
          <Upload className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden md:inline">Importar</span>
        </Button>
        <Button
          variant="outline"
          onClick={onExport}
          className="gap-1.5 apple-interaction h-8 text-xs"
          disabled={!hasTransactions}
        >
          <FileDown className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden md:inline">Exportar</span>
        </Button>
        <Button
          onClick={onAddTransaction}
          variant="outline"
          className="gap-1.5 apple-interaction h-8 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground"
        >
          <Plus className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden md:inline">Adicionar</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div>
        <h1 className="text-title font-bold">Transações</h1>
        <p className="text-body text-muted-foreground mt-1">
          Gerencie todas as suas transações financeiras
        </p>
      </div>
      
      <div className="flex gap-2">
        <Button onClick={onAddTransaction} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Transação
        </Button>
        <Button onClick={onExport} variant="outline" size="sm" disabled={!hasTransactions}>
          <FileDown className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        <Button onClick={onImport} variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
      </div>
    </div>
  );
};
