import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, CalendarPlus, MoreVertical, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Transaction, Account, Category } from "@/types";
import { memo, useMemo } from "react";
import { useEntityMap } from "@/lib/performanceOptimizations";

interface FixedTransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onGenerateNext12Months: (transactionId: string) => void;
}

export const FixedTransactionList = memo(function FixedTransactionList({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  onGenerateNext12Months,
}: FixedTransactionListProps) {
  // ✅ O(1) lookup instead of O(n) find - Performance optimization
  const accountsMap = useEntityMap(accounts);
  const categoriesMap = useEntityMap(categories);

  const getAccountName = useMemo(
    () => (accountId: string) => {
      return accountsMap.get(accountId)?.name || "Conta Desconhecida";
    },
    [accountsMap]
  );

  const getCategoryName = useMemo(
    () => (categoryId: string | null) => {
      if (!categoryId) return "-";
      return categoriesMap.get(categoryId)?.name || "-";
    },
    [categoriesMap]
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "income":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "expense":
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const formatDate = (date: Date | string) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      // Para transações fixas, muitas vezes queremos mostrar o dia do mês
      // Mas vamos manter o formato padrão da lista por enquanto
      return format(dateObj, "dd/MM/yyyy", { locale: ptBR });
    } catch (e) {
      return typeof date === 'string' ? date : 'Data inválida';
    }
  };

  const getDayOfMonth = (date: Date | string) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      // Ajuste de fuso horário pode ser necessário dependendo de como a data é salva
      // Mas assumindo UTC ou local consistente:
      return dateObj.getUTCDate(); 
    } catch (e) {
      return "?";
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhum planejamento encontrado
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-background"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">{getTypeIcon(transaction.type)}</div>
            
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{transaction.description}</span>
                {transaction.is_provision && (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground hover:bg-muted/80">
                    Provisão
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="truncate">Todo dia {getDayOfMonth(transaction.date)}</span>
                <span className="truncate">{getCategoryName(transaction.category_id)}</span>
                <span className="truncate">{getAccountName(transaction.account_id)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
            <span
              className={`font-semibold text-lg ${
                transaction.type === "income"
                  ? "text-success"
                  : "text-destructive"
              }`}
            >
              {transaction.type === "income" ? "+" : "-"}
              {formatCurrency(Math.abs(transaction.amount) * 100)}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onGenerateNext12Months(transaction.id)}>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Gerar 12 meses
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(transaction)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(transaction)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
});
