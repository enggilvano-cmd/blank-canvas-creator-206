import { useTransactions } from "@/hooks/queries/useTransactions";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useAuth } from "@/hooks/useAuth";

export function DebugDashboard() {
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const { transactions: allTransactions } = useTransactions({
    pageSize: null,
  });

  const totalBalance = accounts
    .filter((acc) => 
      acc.type === 'checking' || 
      acc.type === 'savings' || 
      acc.type === 'meal_voucher'
    )
    .reduce((sum, acc) => sum + acc.balance, 0);

  const incomeTransactions = allTransactions.filter(t => t.type === 'income' && !t.to_account_id && t.status === 'completed');
  const expenseTransactions = allTransactions.filter(t => t.type === 'expense' && !t.to_account_id && t.status === 'completed');
  
  const periodIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  const periodExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="p-4 bg-black text-white font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">🐛 DEBUG DASHBOARD</h1>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 p-4 rounded">
          <h2 className="font-bold mb-2">USER</h2>
          <pre>{JSON.stringify(user?.id, null, 2)}</pre>
        </div>

        <div className="bg-gray-900 p-4 rounded">
          <h2 className="font-bold mb-2">ACCOUNTS</h2>
          <pre>{JSON.stringify({
            count: accounts.length,
            totalBalance,
            accounts: accounts.map(a => ({
              id: a.id,
              name: a.name,
              type: a.type,
              balance: a.balance,
            }))
          }, null, 2)}</pre>
        </div>

        <div className="bg-gray-900 p-4 rounded col-span-2">
          <h2 className="font-bold mb-2">TRANSACTIONS</h2>
          <pre>{JSON.stringify({
            totalCount: allTransactions.length,
            incomeCount: incomeTransactions.length,
            expenseCount: expenseTransactions.length,
            periodIncome,
            periodExpenses,
            balance: periodIncome - periodExpenses,
            sample: allTransactions.slice(0, 3).map(t => ({
              id: t.id,
              type: t.type,
              amount: t.amount,
              status: t.status,
              date: t.date,
              description: t.description,
              to_account_id: t.to_account_id,
            }))
          }, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
