# Diagnóstico: Bug de Atualização ao Editar Transação

## Problema Relatado
Quando o usuário edita o valor de uma transação lançada, os gráficos e cards do dashboard não atualizam imediatamente.

## Análise do Fluxo

### 1. Fluxo de Edição
```
EditTransactionModal (linha 127)
  → onEditTransaction (prop)
    → handleEditTransaction (useOfflineTransactionMutations)
      → handleEditTransaction (useTransactionMutations, linha 184)
        → supabase.functions.invoke('atomic-edit-transaction')
        → await invalidateTransactions() (linha 326)
```

### 2. Invalidação de Queries
**Arquivo:** `src/hooks/useQueryInvalidation.ts` (linha 32-44)

```typescript
const invalidateTransactions = useCallback(
  async (options = {}) => {
    await helper.invalidateMultiple([
      queryKeys.transactionsBase,  // ✅ Invalida TODAS as queries de transações
      queryKeys.accounts,          // ✅ Invalida contas (para atualizar saldos)
    ], {
      refetch: true,   // ✅ Força refetch
      force: true,     // ✅ Força refetch mesmo que não estejam stale
      ...options,
    });
  },
  [helper]
);
```

### 3. Queries de Transações no Index.tsx

**Query 1: Transações Filtradas (para lista)**
```typescript
// Linha 238-263
const {
  transactions: filteredTransactions,
  ...
} = useTransactions({
  page: transactionsPage,
  pageSize: transactionsPageSize,
  search: transactionsFilters.search,
  // ... outros filtros
});
```

**Query 2: Todas as Transações (para Dashboard)**
```typescript
// Linha 268-276
const {
  transactions: allTransactions,
  isLoading: loadingAllTransactions,
  isFetching: fetchingAllTransactions,
} = useTransactions({
  pageSize: null, // ✅ Buscar TODAS para cálculos corretos
});
```

### 4. Dashboard Recebe Dados
```typescript
// Linha 484-488
const renderDashboard = () => (
  <Dashboard
    accounts={accounts}
    transactions={allTransactions}  // ✅ Usa allTransactions
    fixedTransactions={fixedTransactions || []}
    categories={categories}
    isFetching={fetchingAllTransactions}
```

## Possíveis Causas do Bug

### Causa 1: Cache Stale Time (MAIS PROVÁVEL)
**Arquivo:** `src/hooks/queries/useTransactions.tsx` (linha 580)

```typescript
staleTime: 30 * 1000, // 30 segundos
```

**Problema:** Mesmo com `force: true` na invalidação, pode haver race condition onde:
1. Invalidação acontece
2. Refetch é disparado
3. Mas o componente ainda renderiza com dados antigos do cache por alguns milissegundos

### Causa 2: Update Otimista Incompleto
**Arquivo:** `src/hooks/transactions/useTransactionMutations.tsx` (linha 210-279)

O update otimista só atualiza a query atual (`editScope === 'current'`), mas não atualiza TODAS as variações de queries de transações que podem existir no cache.

```typescript
// Linha 210-279
if (!editScope || editScope === 'current') {
  // Atualiza apenas UMA query específica
  queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, ...)
}
```

**Problema:** Existem múltiplas queries com diferentes filtros:
- `['transactions', page, pageSize, search, ...]` - Query filtrada
- `['transactions', 0, null, '', 'all', ...]` - Query sem filtros (allTransactions)

O update otimista pode não estar atualizando TODAS elas.

### Causa 3: Invalidação Não Aguardada
**Arquivo:** `src/hooks/transactions/useTransactionMutations.tsx` (linha 326)

```typescript
await invalidateTransactions();
```

Embora use `await`, a invalidação pode não estar completando antes do modal fechar e o componente re-renderizar.

## Solução Proposta

### Opção 1: Remover/Reduzir staleTime para Transações (RECOMENDADO)
Reduzir o staleTime de 30s para 0s ou 5s para garantir que dados sempre sejam considerados stale após mutações.

### Opção 2: Melhorar Update Otimista
Garantir que o update otimista atualize TODAS as variações de queries de transações no cache.

### Opção 3: Forçar Refetch Explícito
Após a invalidação, forçar um refetch explícito das queries críticas.

### Opção 4: Adicionar Delay Antes de Fechar Modal
Adicionar um pequeno delay (100-200ms) antes de fechar o modal para garantir que o refetch complete.

## Próximos Passos
1. Implementar Opção 1 (reduzir staleTime)
2. Melhorar update otimista para cobrir todas as queries
3. Adicionar logs para debug do fluxo de invalidação
