/**
 * Utilitários para filtrar corretamente transações de transferência
 * nas agregações de dashboard.
 * 
 * Problema: RPC get_transactions_totals ainda exclui transferências
 * Solução: Filtrar no client-side para contar corretamente
 */

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  linked_transaction_id?: string | null;
  to_account_id?: string | null;
  [key: string]: unknown;
}

/**
 * Verifica se uma transação é o espelho (mirror) de uma transferência.
 * Espelhos são receitas com linked_transaction_id.
 */
export const isTransferMirror = (transaction: Transaction): boolean => {
  return transaction.type === 'income' && !!transaction.linked_transaction_id;
};

/**
 * Verifica se uma transação é a saída de uma transferência.
 * Saídas são despesas com to_account_id.
 */
export const isTransferOutgoing = (transaction: Transaction): boolean => {
  return transaction.type === 'expense' && !!transaction.to_account_id;
};

/**
 * Filtra transações para contar apenas aquelas que devem aparecer
 * em cálculos de receita/despesa (excluindo espelhos de transferência).
 */
export const filterForAggregation = (transactions: Transaction[]): Transaction[] => {
  return transactions.filter(t => {
    // Excluir APENAS receitas espelho de transferências
    if (isTransferMirror(t)) {
      return false;
    }
    return true;
  });
};

/**
 * Calcula totais de receita e despesa, excluindo corretamente os espelhos.
 */
export const calculateCorrectTotals = (transactions: Transaction[]) => {
  const filtered = filterForAggregation(transactions);
  
  let totalIncome = 0;
  let totalExpense = 0;

  filtered.forEach(t => {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else if (t.type === 'expense') {
      totalExpense += Math.abs(t.amount);
    }
  });

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
};
