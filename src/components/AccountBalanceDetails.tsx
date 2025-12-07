import { Account } from "@/types";
import { formatCurrency, getAvailableBalance, getCreditCardDebt, hasCreditInFavor } from "@/lib/formatters";

interface AccountBalanceDetailsProps {
  account: Account | undefined | null;
}

export function AccountBalanceDetails({ account }: AccountBalanceDetailsProps) {
  if (!account) {
    return null;
  }

  // Cartão de crédito tem UI diferente
  if (account.type === 'credit') {
    const debt = getCreditCardDebt(account);
    const available = getAvailableBalance(account);
    const hasCredit = hasCreditInFavor(account);
    
    return (
      <div className="text-sm text-muted-foreground space-y-1">
        {hasCredit ? (
          <>
            <p className="text-emerald-600 font-medium">
              Crédito a favor: {formatCurrency(account.balance)}
            </p>
            <p>
              Disponível: {formatCurrency(available)}
            </p>
          </>
        ) : (
          <>
            <p className={debt > 0 ? "text-destructive font-medium" : ""}>
              Dívida: {formatCurrency(debt)}
            </p>
            <p>
              Disponível: {formatCurrency(available)}
            </p>
          </>
        )}
        {account.limit_amount && account.limit_amount > 0 && (
          <span className="block text-xs text-muted-foreground">
            (Limite: {formatCurrency(account.limit_amount)})
          </span>
        )}
      </div>
    );
  }

  // Outras contas
  return (
    <p className="text-sm text-muted-foreground">
      Disponível: {formatCurrency(getAvailableBalance(account))}
      {account.limit_amount && account.limit_amount > 0 ? (
        <span className="block text-xs text-primary">
          (Saldo: {formatCurrency(account.balance)} + Limite: {formatCurrency(account.limit_amount)})
        </span>
      ) : null}
    </p>
  );
}