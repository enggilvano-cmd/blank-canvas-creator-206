# 🔍 DIAGNÓSTICO: Problemas com Transações Fixas e Provisões

## Problemas Identificados

### 1️⃣ **Transações Fixas com Provisão Não Aparecem com Tag "Provisão"**

#### Local do Problema
- **Arquivo**: `src/components/FixedTransactionsPage.tsx` (linha 302)
- **Função**: `handleAdd()`
- **RPC SQL**: `20251213032624_67b1a6ff-880f-431a-8ade-b09d851c9b05.sql` (linhas 53-82 e 90-118)

#### Causa Raiz
```tsx
// ❌ ANTES - Hardcoded false!
const { data, error } = await supabase.rpc('atomic_create_fixed_transaction', {
  ...
  p_is_provision: false,  // 🔴 SEMPRE false, ignora transaction.is_provision!
});
```

**Além disso**, a função SQL **NÃO inseria `is_provision`** nas transações:
```sql
-- ❌ ANTES - Não incluía is_provision
INSERT INTO transactions (
  user_id,
  description,
  amount,
  ...
  is_recurring,
  recurrence_type
  -- ❌ is_provision FALTANDO!
) VALUES (...)
```

#### Impacto
- Quando usuário adiciona uma transação fixa com "Transação com Provisão" marcado, o `is_provision` é ignorado
- As transações geradas não possuem a flag `is_provision = true`
- A tag "Provisão" **nunca aparece** na página de Transações, mesmo que marcado

#### Solução Implementada

✅ **Correção 1**: Passou `transaction.is_provision` para a RPC
```tsx
// ✅ DEPOIS
const { data, error } = await supabase.rpc('atomic_create_fixed_transaction', {
  ...
  p_is_provision: transaction.is_provision || false,
});
```

✅ **Correção 2**: Adicionado `is_provision` nas inserções SQL
```sql
-- ✅ DEPOIS - Inclui is_provision em AMBAS as inserções
INSERT INTO transactions (
  user_id,
  description,
  ...
  is_provision
) VALUES (
  ...
  p_is_provision
)
```

---

### 2️⃣ **Erro de Servidor ao Adicionar Transação Fixa**

#### Local do Problema
- **Arquivo**: `supabase/migrations/20251213032624_67b1a6ff-880f-431a-8ade-b09d851c9b05.sql`
- **Função**: `atomic_create_fixed_transaction()`
- **Linha**: 32-39 (validação de conta)

#### Causa Raiz
**Falta de validação de categoria** quando `p_category_id` é fornecido:
- Se a categoria não existir ou não pertencer ao usuário, a inserção falha silenciosamente
- A RPC não valida se `p_category_id` é válido
- Mensagens de erro não são claras

**Além disso**, faltava logging de erro adequado no frontend

#### Impacto
- Ao adicionar transação fixa com categoria inválida, retorna erro genérico "Account not found"
- Usuário não sabe o que causou o erro
- Fallback para offline mode ocorre desnecessariamente

#### Solução Implementada

✅ **Correção 1**: Adicionada validação de categoria na RPC
```sql
-- ✅ Validar categoria se fornecida
IF p_category_id IS NOT NULL AND p_category_id != '' THEN
  IF NOT EXISTS (
    SELECT 1 FROM categories 
    WHERE id = p_category_id::uuid AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Category not found or does not belong to user'::TEXT;
    RETURN;
  END IF;
END IF;
```

✅ **Correção 2**: Melhorado tratamento de erros no frontend
```tsx
// ✅ ANTES - Mensagem genérica
toast({
  title: "Erro ao adicionar transação",
  description: error.message || "Não foi possível adicionar...",
});

// ✅ DEPOIS - Mensagens específicas
let displayMessage = "Não foi possível adicionar a transação fixa.";
if (errorMessage.includes("Account not found")) {
  displayMessage = "A conta selecionada não existe ou não pertence a você.";
} else if (errorMessage.includes("Category not found")) {
  displayMessage = "A categoria selecionada não existe ou não pertence a você.";
} else if (error instanceof Error) {
  displayMessage = error.message;
}
```

✅ **Correção 3**: Adicionado logging de erro para debug
```tsx
console.error('❌ RPC Error:', { error, message: errorMessage });
console.error('❌ Error adding fixed transaction:', { error, errorMessage });
```

---

## Arquivos Modificados

### 1. `supabase/migrations/20251213032624_67b1a6ff-880f-431a-8ade-b09d851c9b05.sql`
**Linhas modificadas:**
- ✅ Linhas 32-39: Adicionada validação de categoria
- ✅ Linhas 62-65: Adicionado `is_provision` na primeira inserção
- ✅ Linhas 96-104: Adicionado `is_provision` na segunda inserção

### 2. `src/components/FixedTransactionsPage.tsx`
**Linhas modificadas:**
- ✅ Linha 302: Alterado `p_is_provision: false` para `p_is_provision: transaction.is_provision || false`
- ✅ Linhas 307-312: Adicionado console.error para logging de RPC
- ✅ Linhas 346-369: Melhorado tratamento de erros com mensagens específicas

---

## Como Verificar se os Problemas Foram Resolvidos

### Teste 1: Provisão Aparece na Tag
1. Vá para "Planejamento" (FixedTransactionsPage)
2. Clique em "Adicionar Transação Fixa"
3. **Marque a caixa** "Transação com Provisão"
4. Preencha os dados e clique "Adicionar"
5. **Esperado**: A transação aparece com a tag "Provisão" na página de Transações

### Teste 2: Erro de Servidor é Tratado Corretamente
1. Vá para "Planejamento"
2. Clique em "Adicionar Transação Fixa"
3. Tente com dados válidos mas categoria inválida (se possível)
4. **Esperado**: Mensagem de erro clara: "A categoria selecionada não existe ou não pertence a você."

### Teste 3: Logs de Debug
1. Abra console (F12)
2. Tente adicionar transação fixa
3. **Esperado**: Ver logs `❌ RPC Error:` ou `❌ Error adding fixed transaction:` com detalhes

---

## Estrutura da Solução

```
┌─────────────────────────────────────────────────┐
│  Frontend: AddFixedTransactionModal             │
│  - Usuário marca "Transação com Provisão"       │
└────────────────────┬────────────────────────────┘
                     │ onAddTransaction()
                     │ is_provision: true
                     ▼
┌─────────────────────────────────────────────────┐
│  FixedTransactionsPage.handleAdd()              │
│  - Passa transaction.is_provision para RPC      │ ✅ CORRIGIDO
│  - Melhor tratamento de erros                   │ ✅ CORRIGIDO
└────────────────────┬────────────────────────────┘
                     │ p_is_provision: true
                     ▼
┌─────────────────────────────────────────────────┐
│  Supabase RPC: atomic_create_fixed_transaction()│
│  - Valida account                               │
│  - Valida category                              │ ✅ CORRIGIDO
│  - INSERT com is_provision = p_is_provision     │ ✅ CORRIGIDO
└────────────────────┬────────────────────────────┘
                     │ inserted transaction
                     │ is_provision: true
                     ▼
┌─────────────────────────────────────────────────┐
│  Database: transactions table                   │
│  - Transação criada com is_provision = true    │
└────────────────────┬────────────────────────────┘
                     │ query
                     ▼
┌─────────────────────────────────────────────────┐
│  TransactionList.tsx                            │
│  - Renderiza tag "Provisão"                     │ ✅ JÁ FUNCIONAVA
│  - if (transaction.is_provision) → Badge       │
└─────────────────────────────────────────────────┘
```

---

## Notas Técnicas

### Por que o `is_provision` era ignorado?
1. O parâmetro `p_is_provision` era aceito na RPC (função SQL)
2. Mas **nunca era inserido** nas transações
3. As inserções tinham um conjunto fixo de colunas sem `is_provision`
4. Qualquer transação criada teria `is_provision = false` por padrão

### Por que faltava validação de categoria?
1. A RPC só validava se a **conta** pertencia ao usuário
2. Não havia lógica para validar a **categoria**
3. Se a categoria_id fosse inválida, a inserção falharia no nível do banco (FK constraint)
4. Isso resultava em erro genérico sem mensagem clara

### Segurança
- ✅ A RPC usa `SECURITY DEFINER` (executa como admin)
- ✅ Valida que account pertence ao user_id (RLS)
- ✅ Valida que category pertence ao user_id (prevenção de acesso não autorizado)
- ✅ Parâmetros são tipados (previne SQL injection)

---

**Data**: 13 de dezembro de 2025  
**Status**: ✅ PROBLEMAS DIAGNOSTICADOS E CORRIGIDOS
