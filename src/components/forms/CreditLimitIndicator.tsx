import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface CreditLimitIndicatorProps {
  accountId: string;
  accountBalance: number;
  accountLimit: number;
  transactionAmount: number;
  transactionType: "income" | "expense" | "";
  isInstallment?: boolean;
  installmentsCount?: number;
}

export function CreditLimitIndicator({
  accountId,
  accountBalance,
  accountLimit,
  transactionAmount,
  transactionType,
  isInstallment = false,
  installmentsCount = 1,
}: CreditLimitIndicatorProps) {
  const [pendingExpenses, setPendingExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPendingExpenses = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('amount')
          .eq('account_id', accountId)
          .eq('type', 'expense')
          .eq('status', 'pending');

        if (error) throw error;
        
        const total = data?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;
        setPendingExpenses(total);
      } catch (error) {
        logger.error('Error fetching pending expenses:', error);
        setPendingExpenses(0);
      } finally {
        setLoading(false);
      }
    };

    if (accountId) {
      fetchPendingExpenses();
    }
  }, [accountId]);

  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-2 bg-muted rounded"></div>
        <div className="h-4 bg-muted rounded w-1/2"></div>
      </div>
    );
  }

  // Calcular valores
  const currentDebt = Math.abs(Math.min(accountBalance, 0)); // Dívida atual (completed)
  const totalUsed = currentDebt + pendingExpenses;
  const available = accountLimit - totalUsed;

  // Calcular impacto da transação
  let impactAmount = 0;
  if (transactionType === 'expense') {
    impactAmount = isInstallment ? transactionAmount : transactionAmount;
  } else if (transactionType === 'income') {
    impactAmount = -transactionAmount; // Income reduz o uso
  }

  const projectedUsed = Math.max(0, totalUsed + impactAmount);
  const projectedAvailable = accountLimit - projectedUsed;

  // Calcular percentuais
  const currentPercentage = (totalUsed / accountLimit) * 100;
  const projectedPercentage = (projectedUsed / accountLimit) * 100;

  // Determinar cor baseado no percentual projetado
  const getColor = (percentage: number) => {
    if (percentage >= 90) return "text-destructive";
    if (percentage >= 60) return "text-warning";
    return "text-success";
  };

  const colorClass = getColor(projectedPercentage);
  const isOverLimit = projectedAvailable < 0;

  return (
    <div className={cn(
      "space-y-3 rounded-lg border p-4 transition-colors",
      isOverLimit ? "border-destructive bg-destructive/5" : "border-border bg-muted/30"
    )}>
      <div className="flex items-center gap-2">
        <CreditCard className={cn("h-4 w-4", colorClass)} />
        <h4 className="text-sm font-medium">Limite do Cartão</h4>
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Uso Atual</span>
          <span>{currentPercentage.toFixed(1)}%</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div 
            className={cn(
              "h-full transition-all duration-300",
              currentPercentage >= 90 ? "bg-destructive" :
              currentPercentage >= 60 ? "bg-yellow-500" :
              "bg-green-500"
            )}
            style={{ width: `${Math.min(currentPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Valores detalhados */}
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Limite Total:</span>
          <span className="font-medium">{formatCurrency(accountLimit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Usado (Concluído):</span>
          <span className="font-medium">{formatCurrency(currentDebt)}</span>
        </div>
        {pendingExpenses > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pendente:</span>
            <span className="font-medium">{formatCurrency(pendingExpenses)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2">
          <span className="text-muted-foreground">Disponível Agora:</span>
          <span className="font-medium">{formatCurrency(available)}</span>
        </div>
      </div>

      {/* Projeção após transação */}
      {transactionAmount > 0 && transactionType && (
        <div className={cn(
          "mt-3 pt-3 border-t space-y-2",
          isOverLimit && "border-destructive/50"
        )}>
          <div className="flex items-center gap-2">
            <TrendingUp className={cn("h-3.5 w-3.5", colorClass)} />
            <span className="text-xs font-medium">Após esta transação:</span>
          </div>
          
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {transactionType === 'expense' ? 'Novo Gasto:' : 'Pagamento:'}
              </span>
              <span className={cn("font-medium", transactionType === 'income' && "text-success")}>
                {transactionType === 'income' && '- '}
                {formatCurrency(transactionAmount)}
                {isInstallment && installmentsCount > 1 && (
                  <span className="text-muted-foreground ml-1">
                    ({installmentsCount}x)
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className={colorClass}>Disponível Após:</span>
              <span className={colorClass}>
                {formatCurrency(projectedAvailable)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Uso Projetado:</span>
              <span>{projectedPercentage.toFixed(1)}%</span>
            </div>
          </div>

          {/* Alerta se exceder limite */}
          {isOverLimit && (
            <div className="flex items-start gap-2 mt-2 p-2 rounded bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                Esta transação excederá o limite do cartão. 
                {projectedAvailable < 0 && (
                  <span className="font-medium block mt-1">
                    Excesso: {formatCurrency(Math.abs(projectedAvailable))}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
