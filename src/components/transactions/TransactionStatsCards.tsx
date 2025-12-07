import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface TransactionStatsCardsProps {
  totalCount: number;
  income: number;
  expenses: number;
  balance: number;
  formatCurrency: (value: number) => string;
}

export function TransactionStatsCards({
  totalCount,
  income,
  expenses,
  balance,
  formatCurrency,
}: TransactionStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="financial-card">
        <CardContent className="p-3">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-caption text-muted-foreground">
                Total Transações
              </p>
              <div className="balance-text">
                {totalCount}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="financial-card">
        <CardContent className="p-3">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-caption text-muted-foreground">
                Receitas
              </p>
              <div className="balance-text balance-positive">
                {formatCurrency(income)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="financial-card">
        <CardContent className="p-3">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-caption text-muted-foreground">
                Despesas
              </p>
              <div className="balance-text balance-negative">
                {formatCurrency(expenses)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="financial-card">
        <CardContent className="p-3">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-caption text-muted-foreground">
                Saldo
              </p>
              <div
                className={`balance-text ${
                  balance >= 0
                    ? "balance-positive"
                    : "balance-negative"
                }`}
              >
                {formatCurrency(balance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
