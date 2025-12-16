import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Account, Category } from "@/types";
import { ACCOUNT_TYPE_LABELS } from "@/types";
import { formatCurrency } from "@/lib/formatters";

interface AccountCategoryFieldsProps {
  accountId: string;
  categoryId: string;
  type: string;
  accounts: Account[];
  categories: Category[];
  validationErrors: Record<string, string>;
  onAccountChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}

export function AccountCategoryFields({
  accountId,
  categoryId,
  type,
  accounts,
  categories,
  validationErrors,
  onAccountChange,
  onCategoryChange,
}: AccountCategoryFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category_id" className="text-caption">Categoria</Label>
          <Select
            value={categoryId}
            onValueChange={onCategoryChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma categoria" />
            </SelectTrigger>
            <SelectContent>
              {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {validationErrors.category_id && (
            <p className="text-body text-destructive">{validationErrors.category_id}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_id" className="text-caption">Conta</Label>
          <Select
            value={accountId}
            onValueChange={onAccountChange}
          >
            <SelectTrigger className="h-auto">
              <SelectValue placeholder="Selecione uma conta">
                {accountId && (() => {
                  const selectedAccount = accounts.find((acc) => acc.id === accountId);
                  if (!selectedAccount) return null;
                  return (
                    <div className="flex flex-col gap-1 w-full py-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: selectedAccount.color || "#6b7280",
                          }}
                        />
                        <span className="text-body font-medium">{selectedAccount.name}</span>
                        <span className="text-caption text-muted-foreground">
                          - {ACCOUNT_TYPE_LABELS[selectedAccount.type]}
                        </span>
                      </div>
                      <div className="text-caption text-muted-foreground pl-5">
                        {formatCurrency(selectedAccount.balance * 100)}
                        {selectedAccount.limit_amount && selectedAccount.limit_amount > 0 && (
                          <span className="text-primary font-semibold"> + {formatCurrency(selectedAccount.limit_amount)} limite</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[...accounts].sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: account.color || "#6b7280",
                          }}
                        />
                        <span className="text-body">{account.name}</span>
                      </div>
                      <span className="ml-2 text-caption text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </div>
                    <div className="text-caption text-muted-foreground">
                      {formatCurrency(account.balance * 100)}
                      {account.limit_amount && account.limit_amount > 0 && (
                        <span className="text-primary"> + {formatCurrency(account.limit_amount)} limite</span>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {validationErrors.account_id && (
            <p className="text-body text-destructive">{validationErrors.account_id}</p>
          )}
        </div>
      </div>
    </>
  );
}
