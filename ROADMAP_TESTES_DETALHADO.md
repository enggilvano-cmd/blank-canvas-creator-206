# 🎯 ROADMAP RESOLUÇÃO GAP #1 - TESTES

**Objetivo:** Ir de 15% → 70% cobertura de testes  
**Meta Impacto:** +15 pontos na nota (22 → 37)  
**Tempo Total:** 3-4 semanas  

---

## 📅 SEMANA 1 (HOJE - INICIADO)

### ✅ Dia 1 - Hooks Críticos (COMPLETO)

**Testes Criados:**
- ✅ `useAuth.test.tsx` (35 testes, 450 linhas)
- ✅ `useTransactionMutations.test.tsx` (25 testes, 400 linhas)
- ✅ `usePersistedFilters.test.tsx` (20 testes, 300 linhas)

**Resultado:**
```
Total: 80 testes, ~1150 linhas
Cobertura: +5% (15% → 20%)
Nota: +2-3 pontos (22 → 24-25)
```

**Validar com:**
```bash
npm run test -- useAuth.test.tsx
npm run test -- useTransactionMutations.test.tsx
npm run test -- usePersistedFilters.test.tsx
npm run test -- --coverage  # Ver cobertura total
```

---

### 📋 Dias 2-3 - Handlers Adicionais (TODO)

#### useAccountHandlers
**Arquivo:** `src/hooks/useAccountHandlers.tsx`  
**Testes Necessários:** ~20-25

```typescript
describe('useAccountHandlers', () => {
  // Test cases
  describe('handleAddAccount', () => {
    it('should add account successfully')
    it('should handle duplicate account name')
    it('should validate account type')
    it('should set initial balance correctly')
  })

  describe('handleEditAccount', () => {
    it('should edit account successfully')
    it('should prevent name duplicates')
    it('should not allow negative balance')
    it('should update related transactions')
  })

  describe('handleDeleteAccount', () => {
    it('should check for transactions before delete')
    it('should prevent delete if has transactions')
    it('should allow delete if no transactions')
    it('should handle soft delete')
  })

  describe('Validation', () => {
    it('should validate account balance')
    it('should validate account limit')
    it('should validate interest rate')
  })
})
```

**Esforço:** ~5-6h  
**Template:** Usar `useTransactionMutations.test.tsx` como base

---

#### useCategoryHandlers
**Arquivo:** `src/hooks/useCategoryHandlers.tsx`  
**Testes Necessários:** ~15-20

```typescript
describe('useCategoryHandlers', () => {
  describe('handleAddCategory', () => {
    it('should add category successfully')
    it('should prevent duplicate names')
    it('should set icon and color')
  })

  describe('handleEditCategory', () => {
    it('should edit category')
    it('should handle name conflicts')
  })

  describe('handleDeleteCategory', () => {
    it('should check for transactions')
    it('should prevent delete if in use')
    it('should allow delete if unused')
  })

  describe('Sorting & Filtering', () => {
    it('should sort categories by name')
    it('should filter by type')
  })
})
```

**Esforço:** ~4-5h  
**Template:** Usar padrão simples (menos mutações que transactions)

---

#### useBalanceValidation
**Arquivo:** `src/hooks/useBalanceValidation.tsx`  
**Testes Necessários:** ~15-20

```typescript
describe('useBalanceValidation', () => {
  describe('validateBalance', () => {
    it('should validate sufficient balance')
    it('should consider account limit')
    it('should handle negative balances')
    it('should check overdraft')
  })

  describe('calculateAvailableBalance', () => {
    it('should calculate available balance correctly')
    it('should include limit')
    it('should exclude pending transactions')
  })

  describe('preventOverdraft', () => {
    it('should prevent transaction exceeding limit')
    it('should allow if within limit')
  })
})
```

**Esforço:** ~4-5h  
**Notas:** Testes mais simples, funções puras

---

#### useOfflineSync
**Arquivo:** `src/lib/offlineSync.ts`  
**Testes Necessários:** ~20-25

```typescript
describe('offlineSync', () => {
  describe('saveOffline', () => {
    it('should save data to IndexedDB')
    it('should save to localStorage if IndexedDB fails')
    it('should handle large data')
  })

  describe('syncOnline', () => {
    it('should sync pending changes')
    it('should handle conflicts')
    it('should retry on network error')
  })

  describe('getRace Conditions', () => {
    it('should prevent duplicate syncs')
    it('should maintain FIFO order')
    it('should handle concurrent syncs')
  })
})
```

**Esforço:** ~6-8h  
**Notas:** Crítico para offline-first, testing async queue

---

### 📊 Resultado Esperado Semana 1

```
Dia 1 (Hoje):   useAuth, Transactions, Filters = +5%
Dia 2:          Accounts, Categories = +3%
Dia 3:          Balance, Offline = +4%
________________
Total Semana 1: 15% → 27% cobertura
Nota:           22 → 29/100
```

---

## 📅 SEMANA 2-3 (Próximas)

### Componentes Críticos (~20-25h)

#### Dashboard.test.tsx
- [ ] Rendering dashboard
- [ ] Loading states
- [ ] Error boundaries
- [ ] Widget interactions
- [ ] Data aggregation

**Testes:** ~30  
**Esforço:** 8h

#### TransactionsPage.test.tsx
- [ ] Render transaction list
- [ ] Filter/sort functionality
- [ ] Add/edit/delete interactions
- [ ] Import functionality
- [ ] Pagination

**Testes:** ~25  
**Esforço:** 7h

#### CreditBillsPage.test.tsx
- [ ] Render bills
- [ ] Payment flow
- [ ] Bill calculations
- [ ] Status updates

**Testes:** ~20  
**Esforço:** 6h

#### AnalyticsPage.test.tsx
- [ ] Chart rendering
- [ ] Period filtering
- [ ] Export functionality
- [ ] Data calculations

**Testes:** ~20  
**Esforço:** 6h

---

### Utilidades & Libs (~10-12h)

#### errorUtils.test.ts
```typescript
describe('errorUtils', () => {
  it('should extract error message')
  it('should identify error types')
  it('should create error summaries')
})
```
**Testes:** 10  |  **Esforço:** 2h

#### dateUtils.test.ts
```typescript
describe('dateUtils', () => {
  it('should format dates correctly')
  it('should parse dates')
  it('should calculate periods')
  it('should handle timezones')
})
```
**Testes:** 15  |  **Esforço:** 2.5h

#### formatters.test.ts
```typescript
describe('formatters', () => {
  it('should format currency')
  it('should format percentages')
  it('should format phone numbers')
})
```
**Testes:** 10  |  **Esforço:** 1.5h

---

### 📊 Resultado Esperado Semana 2-3

```
Semana 1:      15% → 27% (+5%)
Semana 2-3:    27% → 65% (+35%)
  ├─ Componentes: +20%
  └─ Utilidades: +15%

Nota: 29 → 35/100
```

---

## 🚀 PRIORIZAÇÃO

### Crítica (Comece Aqui)
1. ✅ useAuth (FEITO)
2. ✅ useTransactionMutations (FEITO)
3. ⏳ useAccountHandlers (Próximo)
4. ⏳ useCategoryHandlers (Próximo)
5. ⏳ Dashboard.test.tsx
6. ⏳ TransactionsPage.test.tsx

### Alta
7. useBalanceValidation
8. useOfflineSync
9. CreditBillsPage
10. AnalyticsPage

### Média
11. Error utilities
12. Date utilities
13. Formatters
14. UI Components

---

## 💡 DICAS DE IMPLEMENTAÇÃO

### 1. Reutilize Padrões
Todos os testes de handlers seguem mesmo padrão:
- Mock Supabase
- Setup QueryClient
- Teste happy path
- Teste error cases
- Teste edge cases

### 2. Use Template
```typescript
describe('use[Feature]Handlers', () => {
  let queryClient: QueryClient;
  
  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const { result } = renderHook(() => use[Feature]Handlers(), { wrapper });
  // ... testes
});
```

### 3. Copiar Mock Setup
Use `useAuth.test.tsx` como template para mocks Supabase.

### 4. Teste Cenários Reais
- Usuário deslogado
- Rede lenta/offline
- Dados corrompidos
- Concorrência

---

## 📈 MÉTRICAS DE SUCESSO

```
Meta Semana 1:  40% cobertura     ← Estamos aqui (20%)
Meta Semana 2:  60% cobertura
Meta Semana 3:  70% cobertura     ← Objetivo final

Nota Semana 1:  22 → 29/100       ← +7 pontos
Nota Semana 2:  29 → 33/100       ← +4 pontos
Nota Semana 3:  33 → 38/100 ✅    ← +5 pontos
```

---

## ✅ VALIDAÇÃO

Após completar cada dia/semana:

```bash
# Rodar testes
npm run test

# Ver cobertura
npm run test -- --coverage

# Verificar quais arquivos ainda não têm testes
npm run test -- --coverage --reporter=text-summary
```

---

## 🎯 PRÓXIMA AÇÃO

**Hoje (Dia 1):**
1. ✅ Criar 3 arquivos de teste (COMPLETO)
2. ✅ Rodar: `npm run test`
3. ✅ Validar output

**Próximo (Dias 2-3):**
1. Criar `useAccountHandlers.test.tsx` (~5h)
2. Criar `useCategoryHandlers.test.tsx` (~4h)
3. Criar `useBalanceValidation.test.tsx` (~4h)
4. Criar `useOfflineSync.test.ts` (~6h)
5. Total: ~19h para +12% cobertura

**Esta Semana:**
- [ ] Atingir 40% cobertura
- [ ] +15 pontos na nota (22→37)
- [ ] ~80 testes novos

---

## 📞 COMANDOS ÚTEIS

```bash
# Rodar todos os testes
npm run test

# Rodar apenas testes de hooks
npm run test -- src/hooks

# Rodar com cobertura detalhada
npm run test -- --coverage

# Rodar em watch mode
npm run test -- --watch

# Rodar teste específico
npm run test -- useAuth.test.tsx

# Gerar relatório HTML de cobertura
npm run test -- --coverage --reporter=html
# Abrir: coverage/index.html
```

---

## 🎖️ RECOMENDAÇÃO

**Comece AGORA com os 4 próximos testes (Dias 2-3):**
- useAccountHandlers (~5h)
- useCategoryHandlers (~4h)
- useBalanceValidation (~4h)
- useOfflineSync (~6h)

**Total:** ~19h para +12% cobertura extra

**Resultado:** 15% → 32% em 3 dias

---

**Status:** Iniciado com Sucesso ✅  
**Próxima Revisão:** Após completar testes de Accounts/Categories  
**Data:** 5/12/2025
