/**
 * Debug da detecção de pares de transferência
 * Execute no console do browser para testar a lógica
 */

// Simular dados de importação
const testData = [
  {
    description: "Transferência Santander",
    amount: 150000, // 1500.00 em centavos
    date: "2025-12-05",
    type: "expense",
    account_id: "account-123",
    to_account_id: "account-456",
    status: "completed"
  },
  {
    description: "Transferência para Inter G",
    amount: 150000,
    date: "2025-12-05",
    type: "income",
    account_id: "account-456", // Conta destino da transferência
    status: "completed"
  }
];

// Copie a função detectTransferPairs aqui:
function detectTransferPairs(transactions) {
  const pairs = [];
  const usedIndexes = new Set();

  transactions.forEach((expenseData, expenseIndex) => {
    if (usedIndexes.has(expenseIndex)) return;

    const hasDestination = Boolean(expenseData.to_account_id) && 
                          (expenseData.type === 'transfer' || expenseData.type === 'expense');
    if (!hasDestination) {
      console.log(`[${expenseIndex}] Pulando: não é despesa/transferência com to_account_id`);
      return;
    }

    const incomeIndex = transactions.findIndex((incomeData, index) => {
      if (usedIndexes.has(index) || index === expenseIndex) return false;
      if (incomeData.type !== 'income') return false;

      const matches = 
        incomeData.account_id === expenseData.to_account_id &&
        incomeData.amount === expenseData.amount &&
        incomeData.date === expenseData.date;

      console.log(`[${expenseIndex}] Checando income [${index}]:`, {
        account_id_matches: incomeData.account_id === expenseData.to_account_id,
        amount_matches: incomeData.amount === expenseData.amount,
        date_matches: incomeData.date === expenseData.date,
        resultado: matches
      });

      return matches;
    });

    if (incomeIndex === -1) {
      console.log(`[${expenseIndex}] Nenhuma receita encontrada`);
      return;
    }

    console.log(`[${expenseIndex}] MATCH ENCONTRADO com [${incomeIndex}]`);
    usedIndexes.add(expenseIndex);
    usedIndexes.add(incomeIndex);
    pairs.push({ 
      expense: expenseData, 
      income: transactions[incomeIndex] 
    });
  });

  const remaining = transactions.filter((_, index) => !usedIndexes.has(index));
  return { pairs, remaining };
}

// Testar
console.log("Testando detecção de pares...");
const result = detectTransferPairs(testData);
console.log("Resultado:", result);
console.log("Pares encontrados:", result.pairs.length);
console.log("Linhas restantes:", result.remaining.length);
