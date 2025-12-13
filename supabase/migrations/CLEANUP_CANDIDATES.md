# Migrations - Candidates for Cleanup

**Data:** 12 de dezembro de 2025  
**Status:** Identificadas - Não remover ainda (Supabase depende de histórico)

## 📋 Migrations Redundantes (Por Versão)

### **Grupo 1: Race Condition Fixes (Versões Múltiplas)**
Status: 3 versões - REMOVER 2

```
REMOVER:
- 20251125200624_6f3ff7b7-cb88-459d-bf2f-658781ed8e6a.sql
- 20251207_fix_transfer_type_critical.sql

MANTER (VERSÃO FINAL):
✅ 20251206_fix_transfer_isolation.sql (SERIALIZABLE + completo)
```

Motivo: 20251206 é versão final com todas as correções aplicadas

---

### **Grupo 2: Cálculos de Saldo (Versões Múltiplas)**
Status: 2 versões - possível consolidar

```
MANTER AMBAS (não causam problema):
- 20251118030030_95f7dcb0-8317-451d-9468-c3a06fae5d69.sql
- Qualquer outra versão de recalculation
```

Motivo: Idempotentes, não causa conflito

---

### **Grupo 3: Transações Fixas**
Status: Múltiplas - REVISAR

```
REVISAR:
- 20251113*.sql (Múltiplas versões)
- Consolidar em 1 única migration se possível
```

---

## 🔍 Como Identificar Redundância

1. **Mesmo nome de função**: Busque `CREATE OR REPLACE FUNCTION`
2. **Mesma tabela**: Busque `ALTER TABLE`
3. **Mesma operação**: Compara lógica

### Exemplo
```sql
-- 20251206_fix_transfer_isolation.sql
CREATE OR REPLACE FUNCTION public.atomic_create_transfer(...) RETURNS ...

-- 20251207_fix_transfer_type_critical.sql
CREATE OR REPLACE FUNCTION public.atomic_create_transfer(...) RETURNS ...

-- ❌ DUPLICADO! Segunda sobrescreve primeira
```

---

## ✅ Recomendações

### Curto Prazo (Semana 1)
- [x] Criar este documento
- [x] Documentar versões finais
- [ ] Testar que sistema funciona com migrations atuais

### Médio Prazo (Semana 3)
- [ ] Consolidar em 1 migration apenas por operação
- [ ] Testar em staging
- [ ] Documentar em CHANGELOG

### Longo Prazo (Semana 6)
- [ ] Opcionalmente: Remove migrations antigas do git (backup first!)
- [ ] Manter apenas versão final consolidada

---

## ⚠️ CUIDADO

**NÃO remova migrations do Supabase diretamente!**
- Supabase usa hash de migrations para track
- Remover uma applied migration = erro em produção
- Solução: Cria migration que DESFAZ a anterior

Se necessário remover:
```sql
-- Migration que desfaz anterior
DROP FUNCTION IF EXISTS public.atomic_create_transfer(...) CASCADE;

-- Re-cria apenas a versão final
CREATE FUNCTION public.atomic_create_transfer(...) AS ...
```

---

## 📊 Sumário

| Grupo | Quantidade | Status | Ação |
|-------|-----------|--------|------|
| Race Condition | 3 | ✅ Consolidado | Manter apenas 1 |
| Saldo | 2+ | ✅ OK | Manter ambas |
| Transações | 5+ | ⚠️ Review | Consolidar se possível |
| **TOTAL** | **~94** | **Mixed** | **Documentar** |

---

**Criado:** 12/12/2025  
**Prioridade:** 🟡 Média (melhorar depois)  
**Esforço:** 4-6 horas para cleanup completo
