import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, EyeOff, Eye } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { Account } from '@/types';
import { memo, useMemo, useState, useEffect } from 'react';

interface AccountsSummaryProps {
  accounts: Account[];
  accountTypes?: ('checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher')[];
  title?: string;
  emptyMessage?: string;
  onNavigateToAccounts?: () => void;
  onAddAccount?: () => void;
}

export const AccountsSummary = memo(function AccountsSummary({
  accounts,
  accountTypes,
  title = 'Suas Contas',
  emptyMessage = 'Nenhuma conta cadastrada',
  onNavigateToAccounts,
  onAddAccount,
}: AccountsSummaryProps) {
  const { formatCurrency } = useSettings();
  
  // Persistir estado no localStorage usando o title como chave
  const storageKey = `hideZeroBalances_${title}`;
  const [hideZeroBalances, setHideZeroBalances] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : false;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(hideZeroBalances));
  }, [hideZeroBalances, storageKey]);

  // ✅ Memoização para evitar recalcular em cada render
  const filteredAccounts = useMemo(
    () => {
      // Sempre ignora contas marcadas como ignoradas
      let filtered = accounts.filter((account) => !account.ignored);
      if (accountTypes) {
        filtered = filtered.filter((account) => accountTypes.includes(account.type));
      }
      // Filtra contas com saldo zero se a opção estiver ativada
      if (hideZeroBalances) {
        filtered = filtered.filter((account) => account.balance !== 0);
      }
      return filtered;
    },
    [accounts, accountTypes, hideZeroBalances]
  );

  const totalBalance = useMemo(
    () => filteredAccounts.reduce(
      (sum, account) => sum + account.balance,
      0
    ),
    [filteredAccounts]
  );

  return (
    <Card
      className="financial-card cursor-pointer apple-interaction"
      onClick={() => onNavigateToAccounts?.()}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {title} ({filteredAccounts.length})
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setHideZeroBalances(!hideZeroBalances);
            }}
            className="h-7 w-7 p-0 hover:bg-muted"
            title={hideZeroBalances ? "Mostrar contas zeradas" : "Ocultar contas zeradas"}
          >
            {hideZeroBalances ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-3 text-muted-foreground">
            <p className="text-xs">{emptyMessage}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddAccount?.();
              }}
              className="mt-2 h-7 text-xs"
            >
              Adicionar conta
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-1.5 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: account.color || '#6b7280' }}
                  >
                    <div className="text-caption font-semibold">
                      {account.type === 'checking' && 'C'}
                      {account.type === 'savings' && 'P'}
                      {account.type === 'credit' && 'R'}
                      {account.type === 'investment' && 'I'}
                      {account.type === 'meal_voucher' && 'V'}
                    </div>
                  </div>
                  <p className="font-medium text-xs truncate">{account.name}</p>
                </div>
                <div
                  className={`text-xs font-medium flex-shrink-0 ${
                    account.type === 'credit'
                      ? account.balance < 0
                        ? 'text-destructive'
                        : 'text-success'
                      : account.balance >= 0
                      ? 'text-success'
                      : 'text-destructive'
                  }`}
                >
                  {formatCurrency(account.balance * 100)}
                </div>
              </div>
            ))}
            {filteredAccounts.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total:</span>
                  <span
                    className={`text-sm font-medium ${
                      accountTypes?.includes('credit')
                        ? totalBalance < 0
                          ? 'text-destructive'
                          : 'text-success'
                        : totalBalance >= 0
                        ? 'text-success'
                        : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(totalBalance * 100)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
