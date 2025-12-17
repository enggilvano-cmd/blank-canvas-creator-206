import { Button } from "@/components/ui/button";
import { Plus, Upload, FileDown, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/hooks/queries/useAccounts";

interface AccountsHeaderProps {
  onAddAccount: () => void;
  onTransfer?: () => void;
  onImport?: () => void;
  isHeaderVersion?: boolean;
}

export function AccountsHeader({
  onAddAccount,
  onTransfer,
  onImport,
  isHeaderVersion = false,
}: AccountsHeaderProps) {
  const { accounts } = useAccounts();
  const { toast } = useToast();

  const exportToExcel = async () => {
    try {
      const { exportAccountsToExcel } = await import('@/lib/exportUtils');
      const filteredAccounts = accounts.filter(acc => !acc.ignored);
      await exportAccountsToExcel(filteredAccounts);
      toast({
        title: "Sucesso",
        description: `${filteredAccounts.length} conta${filteredAccounts.length !== 1 ? 's' : ''} exportada${filteredAccounts.length !== 1 ? 's' : ''} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar contas",
        variant: "destructive",
      });
    }
  };

  if (!isHeaderVersion) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {onImport && (
        <Button
          onClick={onImport}
          variant="outline"
          size="sm"
          className="gap-1.5 apple-interaction h-8 text-xs"
          title="Importar"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Importar</span>
        </Button>
      )}
      <Button
        onClick={exportToExcel}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs"
        disabled={accounts.length === 0}
        title="Exportar"
      >
        <FileDown className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Exportar</span>
      </Button>
      {onTransfer && (
        <Button
          onClick={onTransfer}
          variant="outline"
          size="sm"
          className="gap-1.5 apple-interaction h-8 text-xs"
          title="Transferência"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Transferência</span>
        </Button>
      )}
      <Button
        onClick={onAddAccount}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground"
        title="Adicionar Conta"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Adicionar</span>
      </Button>
    </div>
  );
}