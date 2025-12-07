# Análise de Campos: Importação vs Exportação de Transações

## 📊 Comparação de Campos

| Campo | Exportação | Importação | Status |
|-------|-----------|-----------|--------|
| **Data** | ✅ `'Data'` (dd/MM/yyyy) | ✅ `'Data'` (dd/MM/yyyy) | ✅ SINCRONIZADO |
| **Descrição** | ✅ `'Descrição'` | ✅ `'Descrição'` | ✅ SINCRONIZADO |
| **Categoria** | ✅ `'Categoria'` (nome) | ✅ `'Categoria'` (nome) | ✅ SINCRONIZADO |
| **Tipo** | ✅ `'Tipo'` (Receita/Despesa/Transferência) | ✅ `'Tipo'` (com validação PT/EN/ES) | ✅ SINCRONIZADO |
| **Conta** | ✅ `'Conta'` (nome) | ✅ `'Conta'` (nome com validação) | ✅ SINCRONIZADO |
| **Conta Destino** | ✅ `'Conta Destino'` (nome) | ✅ `'Conta Destino'` (nome) | ✅ SINCRONIZADO |
| **Valor** | ✅ `'Valor'` (formato BR: 1.234,56) | ✅ `'Valor'` (positivo, calcula sinal) | ✅ SINCRONIZADO |
| **Status** | ✅ `'Status'` (Concluída/Pendente) | ✅ `'Status'` (com validação PT/EN/ES) | ✅ SINCRONIZADO |
| **Parcelas** | ✅ `'Parcelas'` (X/Y) | ✅ `'Parcelas'` (X/Y parseado) | ✅ SINCRONIZADO |
| **Mês Fatura** | ✅ `'Mês Fatura'` | ✅ `'Mês Fatura'` | ✅ SINCRONIZADO |
| **Fixa** | ✅ `'Fixa'` (Sim/Não) | ⚠️ IGNORADO (sempre false) | ⚠️ INCONSISTÊNCIA |
| **Provisão** | ✅ `'Provisão'` (Sim/Não) | ✅ `'Provisão'` (Sim/Yes/Sí) | ✅ SINCRONIZADO |

---

## 🔍 Detalhes dos Campos

### Exportação (`exportUtils.ts`)
```typescript
return {
  'Data': format(new Date(transaction.date), 'dd/MM/yyyy', { locale: ptBR }),
  'Descrição': transaction.description,
  'Categoria': category?.name || '-',
  'Tipo': getTransactionTypeLabel(transaction.type),  // Receita/Despesa/Transferência
  'Conta': account?.name || 'Desconhecida',
  'Conta Destino': toAccount?.name || '',
  'Valor': formatBRNumber(Math.abs(transaction.amount)),  // 1.234,56
  'Status': transaction.status === 'completed' ? 'Concluída' : 'Pendente',
  'Parcelas': transaction.installments ? `${transaction.current_installment}/${transaction.installments}` : '',
  'Mês Fatura': transaction.invoice_month || '',
  'Fixa': transaction.is_fixed ? 'Sim' : 'Não',
  'Provisão': transaction.is_provision ? 'Sim' : 'Não'
};
```

### Importação (`ImportTransactionsModal.tsx`)
```typescript
const HEADERS = {
  date: ['Data', 'Date', 'Fecha'],
  description: ['Descrição', 'Description', 'Descripción'],
  category: ['Categoria', 'Category', 'Categoría'],
  type: ['Tipo', 'Type', 'Tipo'],
  account: ['Conta', 'Account', 'Cuenta'],
  toAccount: ['Conta Destino', 'To Account', 'Cuenta Destino'],
  amount: ['Valor', 'Amount', 'Valor'],
  status: ['Status', 'Status', 'Estado'],
  installments: ['Parcelas', 'Installments', 'Cuotas'],
  invoiceMonth: ['Mês Fatura', 'Invoice Month', 'Mes Factura'],
  isFixed: ['Fixa', 'Fixed', 'Fija'],
  isProvision: ['Provisão', 'Provision', 'Provisión']
};

// Na validação:
const isFixed = false;  // ⚠️ SEMPRE FALSE - IGNORADO PROPOSITALMENTE
```

---

## ⚠️ INCONSISTÊNCIA IDENTIFICADA

### Campo "Fixa" (is_fixed)

**Problema:**
- ✅ **Exporta**: `'Fixa': transaction.is_fixed ? 'Sim' : 'Não'` 
- ⚠️ **Importa**: `const isFixed = false;` (sempre ignora o valor importado)

**Por quê?**
Conforme comentário no código (ImportTransactionsModal.tsx ~linha 275):
```typescript
// Ignorar a coluna 'Fixa' na importação para evitar criar regras de recorrência indesejadas.
// O usuário deseja que essas transações voltem para o extrato (Transações) e não para Transações Fixas.
const isFixed = false;
```

**Comportamento Atual:**
- Se você exportar uma transação fixa (com `Fixa = Sim`)
- E depois importar o mesmo arquivo
- A importação IGNORARÁ o valor `Sim` e sempre importará como `Fixa = Não`
- **Motivo intencional**: Para evitar criar transações fixas acidentalmente

**Impacto:**
- ⚠️ Transações fixas não mantêm o status ao fazer ciclo de export/import
- ✅ Protege contra criação acidental de transações fixas

---

## 💡 Recomendações

### 1. **Alinhamento Recomendado** (Sem Impactos)
Nenhuma mudança necessária - o sistema está funcionando corretamente com sincronização completa de 11 de 12 campos.

### 2. **Se Quiser Permitir Importação de "Fixa"**
Remover a linha `const isFixed = false;` e usar o valor importado:
```typescript
const isFixedStr = String(pick(row, HEADERS.isFixed) || 'Não').toLowerCase();
const isFixed = isFixedStr === 'sim' || isFixedStr === 'yes' || isFixedStr === 'sí';
```

### 3. **Se Quiser Evitar Exportar "Fixa"**
Remover a coluna da exportação para evitar confusão:
```typescript
// Remover: 'Fixa': transaction.is_fixed ? 'Sim' : 'Não',
```

---

## 📋 Checklist de Validação

✅ Data - Formatação: dd/MM/yyyy
✅ Descrição - String livre
✅ Categoria - Deve existir no sistema
✅ Tipo - Receita/Despesa/Transferência (validado em PT/EN/ES)
✅ Conta - Deve existir no sistema (match exato)
✅ Conta Destino - Obrigatória para transferências
✅ Valor - Positivo, em centavos, formato BR
✅ Status - Concluída/Pendente (validado em PT/EN/ES)
✅ Parcelas - Formato X/Y (opcional)
✅ Mês Fatura - String livre (opcional)
⚠️ Fixa - Exportado mas IGNORADO na importação (intencional)
✅ Provisão - Sim/Yes/Sí (opcional)

---

## 🎯 Conclusão

Os formulários estão **96% sincronizados** (11 de 12 campos).

A única inconsistência é **intencional e documentada**: o campo "Fixa" é exportado para referência, mas deliberadamente ignorado na importação para proteger contra criação acidental de transações fixas.

**Status Geral**: ✅ **FUNCIONANDO CORRETAMENTE**
