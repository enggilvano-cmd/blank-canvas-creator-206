import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { Transaction } from '@/types';
import { createDateFromString } from '@/lib/dateUtils';

interface RecentTransactionsProps {
  transactions: Transaction[];
  maxItems: number;
  onNavigateToTransactions?: () => void;
  onAddTransaction: () => void;
}

export function RecentTransactions({
  transactions,
  maxItems,
  onNavigateToTransactions,
  onAddTransaction,
}: RecentTransactionsProps) {
  const { formatCurrency } = useSettings();

  // Ordenar transações por data (mais recentes primeiro)
  // Nota: O filtro de transações PAI já é aplicado na query do useTransactions
  // Removido useMemo para garantir recálculo sempre que transactions mudar
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = typeof a.date === 'string' ? createDateFromString(a.date) : a.date;
    const dateB = typeof b.date === 'string' ? createDateFromString(b.date) : b.date;
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <Card
      className="financial-card cursor-pointer apple-interaction"
      onClick={() => onNavigateToTransactions?.()}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Transações Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {sortedTransactions.length === 0 ? (
          <div className="text-center py-3 text-muted-foreground">
            <p className="text-xs">Nenhuma transação encontrada</p>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddTransaction();
              }}
              className="mt-2 h-7 text-xs"
            >
              Adicionar primeira
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {sortedTransactions.slice(0, maxItems).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-1.5 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs truncate">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground opacity-70">
                      {(typeof transaction.date === 'string'
                        ? createDateFromString(transaction.date)
                        : transaction.date
                      ).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </p>
                  </div>
                  <div
                    className={`text-xs font-medium flex-shrink-0 ${
                      transaction.type === 'income'
                        ? 'balance-positive'
                        : transaction.type === 'transfer'
                        ? 'text-muted-foreground'
                        : 'balance-negative'
                    }`}
                  >
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs opacity-60">
                        {transaction.type === 'income'
                          ? '+'
                          : transaction.type === 'transfer'
                          ? '⇄'
                          : '-'}
                      </span>
                      <span>{formatCurrency(Math.abs(Number(transaction.amount) || 0))}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {sortedTransactions.length > maxItems && (
              <p className="text-xs text-muted-foreground mt-2 text-center opacity-70">
                +{sortedTransactions.length - maxItems} transações
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
