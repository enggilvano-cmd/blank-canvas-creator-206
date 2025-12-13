import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, ArrowRight, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { TransactionActions } from "./TransactionActions";
import { EditScope } from "../TransactionScopeDialog";
import type { Transaction, Account, Category } from "@/types";
import { memo, useMemo } from "react";
import { useEntityMap } from "@/lib/performanceOptimizations";

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  currency: string;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transactionId: string, scope?: EditScope) => void;
  onMarkAsPaid?: (transaction: Transaction) => void;
}

export const TransactionList = memo(function TransactionList({
  transactions,
  accounts,
  categories,
  currency,
  onEdit,
  onDelete,
  onMarkAsPaid,
}: TransactionListProps) {
  // ✅ Otimização: Criar Maps para O(1) lookup ao invés de O(n) find
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

  const getTypeIcon = (transaction: Transaction) => {
    // Transferência de saída (tem to_account_id)
    if (transaction.type === "transfer" || transaction.to_account_id) {
      return <ArrowUpRight className="h-5 w-5 text-red-500" />;
    }
    // Transferência de entrada (income com linked_transaction_id)
    if (transaction.type === "income" && transaction.linked_transaction_id) {
      return <ArrowDownLeft className="h-5 w-5 text-green-500" />;
    }
    // Receita normal
    if (transaction.type === "income") {
      return <TrendingUp className="h-5 w-5 text-success" />;
    }
    // Despesa normal
    if (transaction.type === "expense") {
      return <TrendingDown className="h-5 w-5 text-destructive" />;
    }
    return <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />;
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma transação encontrada
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
            <div className="flex-shrink-0 mt-1">{getTypeIcon(transaction)}</div>
            
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{transaction.description}</span>
                {transaction.installments && transaction.installments > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {transaction.current_installment}/{transaction.installments}
                  </Badge>
                )}
                {transaction.is_fixed && (
                  <Badge variant="outline" className="text-xs border-primary text-primary">
                    Fixa
                  </Badge>
                )}
                {transaction.is_provision && (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground hover:bg-muted/80">
                    Provisão
                  </Badge>
                )}
                {transaction.status === "pending" && (
                  <Badge variant="destructive" className="text-xs">
                    Pendente
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="truncate">{format(transaction.date, "dd/MM/yyyy", { locale: ptBR })}</span>
                <span className="truncate">{getCategoryName(transaction.category_id)}</span>
                {transaction.to_account_id ? (
                  <span className="truncate flex items-center gap-1">
                    {getAccountName(transaction.account_id)}
                    <ArrowRight className="h-3 w-3" />
                    {getAccountName(transaction.to_account_id)}
                  </span>
                ) : transaction.type === 'income' && transaction.linked_transaction_id && transaction.linked_transactions?.accounts ? (
                  <span className="truncate flex items-center gap-1">
                    {getAccountName(transaction.account_id)}
                    <ArrowLeft className="h-3 w-3" />
                    {transaction.linked_transactions.accounts.name}
                  </span>
                ) : (
                  <span className="truncate">{getAccountName(transaction.account_id)}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
            <span
              className={`font-semibold text-lg ${
                transaction.type === "transfer" || transaction.to_account_id
                  ? "text-red-600 dark:text-red-400"
                  : transaction.type === "income" && transaction.linked_transaction_id
                  ? "text-green-600 dark:text-green-400"
                  : transaction.type === "income"
                  ? "text-success"
                  : transaction.type === "expense"
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {/* Transferência de saída */}
              {(transaction.type === "transfer" || transaction.to_account_id) ? "-" : 
               /* Transferência de entrada */
               (transaction.type === "income" && transaction.linked_transaction_id) ? "+" :
               /* Receita normal */
               transaction.type === "income" ? "+" : 
               /* Despesa */
               transaction.type === "expense" ? 
                 (transaction.is_provision && transaction.amount > 0 ? "" : "-") 
                 : ""}
              {/* Quando provisão estoura (amount > 0), mostrar R$ 0,00 */}
              {transaction.is_provision && transaction.type === "expense" && transaction.amount > 0
                ? formatCurrency(0, currency)
                : formatCurrency(Math.abs(transaction.amount), currency)}
            </span>

            <TransactionActions
              transaction={transaction}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkAsPaid={onMarkAsPaid}
            />
          </div>
        </div>
      ))}
    </div>
  );
});
