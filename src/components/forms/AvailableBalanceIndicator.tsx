import { Account } from "@/types";
import { formatCurrency } from "@/lib/formatters";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBalanceValidation } from "@/hooks/useBalanceValidation";

interface AvailableBalanceIndicatorProps {
  account: Account | undefined;
  transactionType: "income" | "expense";
  amountInCents: number;
  className?: string;
}

export function AvailableBalanceIndicator({
  account,
  transactionType,
  amountInCents,
  className,
}: AvailableBalanceIndicatorProps) {
  // ✅ Usa hook centralizado de validação
  const validation = useBalanceValidation({
    account,
    amountInCents,
    transactionType,
  });

  if (!account) return null;

  const { currentBalance, available, balanceAfter, limit } = validation.details;
  const { status, message } = validation;

  const statusConfig = {
    success: {
      icon: CheckCircle,
      bgColor: "bg-success/10",
      borderColor: "border-success/30",
      textColor: "text-success",
      iconColor: "text-success",
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-warning/10",
      borderColor: "border-warning/30",
      textColor: "text-warning",
      iconColor: "text-warning",
    },
    danger: {
      icon: AlertCircle,
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/30",
      textColor: "text-destructive",
      iconColor: "text-destructive",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-all duration-200",
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <span className={cn("text-sm font-medium", config.textColor)}>
          {message}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Saldo atual:</span>
          <span className="font-medium text-foreground">
            {formatCurrency(currentBalance)}
          </span>
        </div>

        {limit > 0 && (
          <div className="flex justify-between">
            <span>Limite:</span>
            <span className="font-medium text-foreground">
              {formatCurrency(limit)}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span>Disponível:</span>
          <span className={cn("font-medium", config.textColor)}>
            {formatCurrency(available)}
          </span>
        </div>

        {amountInCents > 0 && (
          <>
            <div className="border-t border-border/50 my-1 pt-1"></div>
            <div className="flex justify-between">
              <span>Saldo após:</span>
              <span
                className={cn(
                  "font-medium",
                  balanceAfter < 0 && account.type !== "credit"
                    ? "text-destructive"
                    : "text-foreground"
                )}
              >
                {formatCurrency(balanceAfter)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
