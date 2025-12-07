import { Button } from "@/components/ui/button";
import { Plus, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadXLSX } from "@/lib/lazyImports";
import { formatBRNumber } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import type { Transaction, Account } from "@/types";

interface FixedTransactionsHeaderProps {
  onAddFixedTransaction: () => void;
  onImport?: () => void;
  transactions?: Transaction[];
  accounts?: Account[];
  isHeaderVersion?: boolean;
}

export function FixedTransactionsHeader({
  onAddFixedTransaction,
  onImport,
  transactions = [],
  accounts = [],
  isHeaderVersion = false,
}: FixedTransactionsHeaderProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleExportToExcel = async () => {
    try {
      if (!user) return;

      // Para cada parent, contar quantas children pending existem
      const exportDataPromises = transactions.map(async (transaction) => {
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: 'exact', head: true })
          .eq("parent_transaction_id", transaction.id)
          .eq("status", "pending");

        const account = transaction.account || accounts.find(a => a.id === transaction.account_id);
        const dateStr = typeof transaction.date === 'string' ? transaction.date : transaction.date.toISOString().split('T')[0];

        return {
          Descrição: transaction.description,
          Valor: formatBRNumber(Math.abs(transaction.amount)),
          Tipo: transaction.type === "income" ? "Receita" : "Despesa",
          Conta: account?.name || "",
          Categoria: transaction.category?.name || "",
          "Dia do Mês": parseInt(dateStr.split('-')[2], 10),
          "Meses Gerados": count || 0,
          "Provisão": transaction.is_provision ? "Sim" : "Não",
        };
      });

      const exportData = await Promise.all(exportDataPromises);

      const XLSX = await loadXLSX();
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planejamento");
      
      const fileName = `transacoes_fixas_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportação concluída",
        description: `${exportData.length} transação(ões) fixa(s) exportada(s) com sucesso.`,
      });
    } catch (error) {
      logger.error("Error exporting fixed transactions:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar as transações fixas.",
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
        onClick={handleExportToExcel}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs"
        disabled={transactions.length === 0}
        title="Exportar"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Exportar</span>
      </Button>
      <Button
        onClick={onAddFixedTransaction}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground"
        title="Adicionar Transação Fixa"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Adicionar</span>
      </Button>
    </div>
  );
}
