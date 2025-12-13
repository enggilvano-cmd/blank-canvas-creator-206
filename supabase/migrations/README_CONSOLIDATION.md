# Migrations SQL - Consolidação e Histórico

**Data:** 12 de dezembro de 2025  
**Status:** Limpeza em Progresso

## 📋 Histórico de Migrations

### ✅ VERSÃO FINAL E CORRETA

Toda lógica crítica foi consolidada e testada. Use as seguintes migrations como referência:

#### **1. Core Functions - Transfer & Transactions**
- **File:** `20251206_fix_transfer_isolation.sql` (VERSÃO FINAL)
- **Contém:**
  - `atomic_create_transfer()` com SERIALIZABLE isolation level
  - Validação correta de saldo (balance + limit) para TODOS os tipos de conta
  - Race condition prevention
  - Transfer type handling correto

#### **2. Cálculos de Saldo**
- **File:** `20251118030030_95f7dcb0-8317-451d-9468-c3a06fae5d69.sql`
- **Contém:**
  - Recálculo de todos os saldos das contas
  - Garante consistência com nova lógica

#### **3. Transações Fixas & Provisões**
- **Files:** Múltiplos
- **Contém:**
  - Lógica de expiração de provisões
  - Geração de transações fixas

---

## 🗑️ MIGRATIONS ANTIGAS (PODEM SER REMOVIDAS)

As seguintes migrations aplicavam correções incrementais que foram consolidadas:

### Migrations com Versões Múltiplas (Remover antigas)
```
- 20251118024644_ac0b21a4... (OLD)
- 20251118025722_5b3b0bd2... (OLD)
- 20251118025942_1d81b30b... (OLD)
- 20251118042124_1f675552... (OLD)
- 20251118043602_8407177a... (OLD)
- 20251125200624_6f3ff7b7... (OLD - race condition fix)
- 20251206_fix_transfer_isolation.sql (✅ USE THIS)
- 20251207_fix_transfer_type_critical.sql (DUPLICATE - remover)
```

---

## 🔧 COMO USAR

### Para Novos Ambientes
1. Todas as migrations executam em order (Supabase ordena por data)
2. Sistema está funcional após todas executarem
3. CUIDADO: Algumas migrations duplicam operações

### Para Ambientes Existentes
1. **NÃO remova migrations antigas** (já foram aplicadas)
2. Novas migrations só adicionam/alteram
3. Se conflito: consulte git history

---

## 📊 Resumo de Funções Críticas

### `atomic_create_transfer()`
```sql
-- SERIALIZABLE isolation level
-- Previne: Lost updates, race conditions
-- Valida: Saldo disponível (balance + limit) para TODOS account types
-- Versão Final: 20251206_fix_transfer_isolation.sql
```

### `atomic_create_transaction()`
```sql
-- Transações com retry logic
-- Valida invoice_month para credit cards
-- Atualiza saldos automaticamente
```

### `cleanup_expired_provisions()`
```sql
-- Remove provisões expiradas
-- Chamado diariamente via edge function
```

---

## ⚠️ PRÓXIMAS AÇÕES

- [ ] Backup de migrations antigas (opcional)
- [ ] Documentar em CHANGELOG.md
- [ ] Testar em staging antes de remover
- [ ] Remover duplicatas que causam confusion

---

## 📚 Referências

- **ARCHITECTURE.md** - Descreve padrões de database
- **Git history** - Mostra evolução das correções
- **Supabase logs** - Mostra erros de migrations
