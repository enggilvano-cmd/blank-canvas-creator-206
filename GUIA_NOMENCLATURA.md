# 📘 Guia de Nomenclatura e Convenções de Código

**Data:** 25/06/2026  
**Versão:** 1.0

---

## 🎯 OBJETIVO

Este guia estabelece convenções de nomenclatura e estilo de código para garantir consistência e legibilidade em todo o projeto.

---

## 📝 CONVENÇÕES GERAIS

### Idioma
- **Código:** Inglês (variáveis, funções, componentes)
- **Comentários:** Português (para facilitar compreensão da equipe)
- **UI/Mensagens:** Português (interface do usuário)

```typescript
// ✅ BOM
const handleImportAccounts = () => { ... }
const accountsToInsert = [...];

// ❌ RUIM - Mistura de idiomas
const handleImportAccounts = () => { ... }
const categoriesToInsert = [...]; // Português
```

---

## 🔤 NOMENCLATURA DE VARIÁVEIS

### Booleanos
Usar prefixos: `is`, `has`, `should`, `can`, `will`

```typescript
// ✅ BOM
const isLoading = true;
const hasPermission = false;
const shouldUpdate = true;
const canEdit = false;
const willSync = true;

// ❌ RUIM
const loading = true; // Sem prefixo
const permission = false; // Sem prefixo
```

### Números e Contadores
Usar sufixos descritivos: `Count`, `Total`, `Index`, `Number`

```typescript
// ✅ BOM
const transactionCount = 10;
const totalAmount = 1000;
const currentIndex = 0;
const pageNumber = 1;

// ❌ RUIM
const transactions = 10; // Confuso - é array ou número?
const amount = 1000; // Não indica que é total
```

### Arrays e Listas
Usar plural

```typescript
// ✅ BOM
const accounts = [...];
const transactions = [...];
const categories = [...];

// ❌ RUIM
const accountList = [...]; // Redundante
const transactionArray = [...]; // Redundante
```

### Objetos e Maps
Usar singular ou sufixo `Map`, `Dict`

```typescript
// ✅ BOM
const account = { id: '1', name: 'Conta' };
const accountsById = new Map();
const configMap = { ... };

// ❌ RUIM
const accounts = { id: '1' }; // Confuso - parece array
```

---

## 🎨 NOMENCLATURA DE FUNÇÕES

### Event Handlers
Prefixo `handle` + Ação

```typescript
// ✅ BOM
const handleClick = () => { ... };
const handleSubmit = () => { ... };
const handleChange = (e) => { ... };
const handleDelete = (id) => { ... };

// ❌ RUIM
const onClick = () => { ... }; // Confunde com prop
const submit = () => { ... }; // Não indica que é handler
```

### Callbacks e Props de Função
Prefixo `on` + Ação

```typescript
// ✅ BOM - Props
interface Props {
  onSubmit: () => void;
  onChange: (value: string) => void;
  onDelete: (id: string) => void;
}

// ✅ BOM - Uso
<Button onClick={handleClick} />
<Form onSubmit={handleSubmit} />
```

### Funções de Transformação
Usar verbos descritivos

```typescript
// ✅ BOM
const formatCurrency = (value: number) => { ... };
const parseDateString = (date: string) => { ... };
const convertToReais = (cents: number) => { ... };
const calculateTotal = (items: Item[]) => { ... };

// ❌ RUIM
const currency = (value: number) => { ... }; // Não indica ação
const date = (date: string) => { ... }; // Muito genérico
```

### Funções Booleanas
Prefixos: `is`, `has`, `should`, `can`, `validate`, `check`

```typescript
// ✅ BOM
const isValidEmail = (email: string) => boolean;
const hasPermission = (user: User, action: string) => boolean;
const shouldUpdate = (oldData, newData) => boolean;
const canEdit = (user: User) => boolean;
const validateInput = (input: string) => boolean;
const checkQuota = () => boolean;

// ❌ RUIM
const validEmail = (email: string) => boolean; // Sem prefixo
const permission = (user: User) => boolean; // Confuso
```

---

## ⚛️ NOMENCLATURA DE COMPONENTES REACT

### Componentes
PascalCase, nome descritivo

```typescript
// ✅ BOM
export function TransactionList() { ... }
export function AddTransactionModal() { ... }
export function BalanceCard() { ... }

// ❌ RUIM
export function List() { ... } // Muito genérico
export function Modal() { ... } // Muito genérico
export function Card() { ... } // Muito genérico
```

### Hooks Customizados
Prefixo `use` + Nome descritivo

```typescript
// ✅ BOM
export function useAuth() { ... }
export function useTransactions() { ... }
export function useDashboardCalculations() { ... }

// ❌ RUIM
export function auth() { ... } // Sem prefixo use
export function getTransactions() { ... } // Não é hook
```

### Context
Sufixo `Context` + `Provider`

```typescript
// ✅ BOM
export const AuthContext = createContext();
export function AuthProvider({ children }) { ... }

// ❌ RUIM
export const Auth = createContext(); // Sem sufixo
export function AuthContextProvider() { ... } // Redundante
```

---

## 🗂️ NOMENCLATURA DE ARQUIVOS

### Componentes
PascalCase, mesmo nome do componente principal

```
✅ BOM
src/components/
  ├── TransactionList.tsx
  ├── AddTransactionModal.tsx
  └── BalanceCard.tsx

❌ RUIM
src/components/
  ├── transaction-list.tsx (kebab-case)
  ├── addTransactionModal.tsx (camelCase)
  └── balance_card.tsx (snake_case)
```

### Hooks
camelCase, prefixo `use`

```
✅ BOM
src/hooks/
  ├── useAuth.tsx
  ├── useTransactions.tsx
  └── useDashboardCalculations.tsx

❌ RUIM
src/hooks/
  ├── Auth.tsx (sem prefixo use)
  ├── UseTransactions.tsx (PascalCase)
```

### Utilitários e Helpers
camelCase

```
✅ BOM
src/lib/
  ├── formatters.ts
  ├── dateUtils.ts
  ├── queryClient.ts
  └── constants.ts

❌ RUIM
src/lib/
  ├── Formatters.ts (PascalCase)
  ├── date_utils.ts (snake_case)
```

### Tipos e Interfaces
PascalCase, arquivo `types.ts` ou `index.ts`

```
✅ BOM
src/types/
  ├── index.ts
  ├── transaction.ts
  └── account.ts
```

---

## 🏷️ NOMENCLATURA DE TIPOS

### Interfaces
PascalCase, sem prefixo `I`

```typescript
// ✅ BOM
interface User { ... }
interface Transaction { ... }
interface Account { ... }

// ❌ RUIM
interface IUser { ... } // Prefixo I desnecessário
interface user { ... } // camelCase
```

### Types
PascalCase

```typescript
// ✅ BOM
type TransactionType = 'income' | 'expense' | 'transfer';
type DateFilterType = 'all' | 'current_month' | 'custom';

// ❌ RUIM
type transactionType = ...; // camelCase
type TRANSACTION_TYPE = ...; // SCREAMING_SNAKE_CASE
```

### Props de Componentes
Sufixo `Props`

```typescript
// ✅ BOM
interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (id: string) => void;
}

// ❌ RUIM
interface TransactionListProperties { ... } // Muito longo
interface ITransactionListProps { ... } // Prefixo I
```

---

## 🔑 NOMENCLATURA DE CONSTANTES

### Constantes Globais
SCREAMING_SNAKE_CASE

```typescript
// ✅ BOM
export const CENTS_PER_REAL = 100;
export const MAX_INSTALLMENTS = 360;
export const API_BASE_URL = 'https://api.example.com';

// ❌ RUIM
export const centsPerReal = 100; // camelCase
export const MaxInstallments = 360; // PascalCase
```

### Constantes Locais
camelCase (se não forem exportadas)

```typescript
// ✅ BOM
const defaultPageSize = 50;
const initialFormState = { ... };

// ❌ RUIM
const DEFAULT_PAGE_SIZE = 50; // Desnecessário se local
```

### Enums
PascalCase para enum, SCREAMING_SNAKE_CASE para valores

```typescript
// ✅ BOM
enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// ❌ RUIM
enum transactionStatus { ... } // camelCase
enum TransactionStatus {
  Pending = 'pending', // PascalCase
}
```

---

## 🗄️ NOMENCLATURA DE BANCO DE DADOS

### Tabelas e Colunas
snake_case (padrão PostgreSQL)

```sql
-- ✅ BOM
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ❌ RUIM
CREATE TABLE Transactions ( -- PascalCase
  userId UUID, -- camelCase
  AccountId UUID -- PascalCase
);
```

### Mapeamento TypeScript ↔ Database
```typescript
// ✅ BOM - Manter consistência
interface Transaction {
  id: string;
  user_id: string;      // Mesmo nome do DB
  account_id: string;   // Mesmo nome do DB
  created_at: string;   // Mesmo nome do DB
}

// ⚠️ ACEITÁVEL - Se usar ORM com mapeamento
interface Transaction {
  id: string;
  userId: string;       // camelCase no código
  accountId: string;    // camelCase no código
  createdAt: Date;      // camelCase no código
}
// Mas requer configuração de mapeamento no ORM
```

---

## 📦 ORGANIZAÇÃO DE IMPORTS

### Ordem de Imports
1. React e bibliotecas externas
2. Componentes internos
3. Hooks
4. Utilitários e helpers
5. Tipos
6. Estilos

```typescript
// ✅ BOM
// 1. React e bibliotecas externas
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Componentes internos
import { Button } from '@/components/ui/button';
import { TransactionList } from '@/components/transactions/TransactionList';

// 3. Hooks
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';

// 4. Utilitários e helpers
import { formatCurrency } from '@/lib/formatters';
import { CENTS_PER_REAL } from '@/lib/constants';

// 5. Tipos
import type { Transaction, Account } from '@/types';

// 6. Estilos (se houver)
import './styles.css';
```

---

## 💬 COMENTÁRIOS

### Comentários de Código
Português, explicar "por quê", não "o quê"

```typescript
// ✅ BOM
// Converter para centavos para evitar problemas de precisão com decimais
const amountInCents = amount * CENTS_PER_REAL;

// ❌ RUIM
// Multiplica amount por 100
const amountInCents = amount * 100;
```

### JSDoc
Inglês para APIs públicas, português aceitável para internas

```typescript
// ✅ BOM
/**
 * Converte valor em reais para centavos
 * @param reais - Valor em reais (decimal)
 * @returns Valor em centavos (integer)
 * @example REAIS_TO_CENTS(10.50) // 1050
 */
export const REAIS_TO_CENTS = (reais: number): number => 
  Math.round(reais * CENTS_PER_REAL);
```

### TODOs e FIXMEs
Formato: `// TODO(autor): Descrição - Issue #123`

```typescript
// ✅ BOM
// TODO(gilva): Implementar paginação - Issue #45
// FIXME(gilva): Corrigir race condition - Issue #67
// HACK(gilva): Solução temporária até refatoração - Issue #89

// ❌ RUIM
// TODO: fazer algo
// FIXME
```

---

## 🎨 FORMATAÇÃO

### Indentação
2 espaços (configurado no Prettier)

### Aspas
Simples `'` para strings, duplas `"` para JSX

```typescript
// ✅ BOM
const name = 'John';
<Button label="Click me" />

// ❌ RUIM (mas Prettier corrige)
const name = "John";
<Button label='Click me' />
```

### Ponto e vírgula
Sempre usar (configurado no Prettier)

### Linha em branco
- Entre funções
- Entre blocos lógicos
- Antes de return

---

## ✅ CHECKLIST DE REVISÃO

Antes de fazer commit, verificar:

- [ ] Nomes em inglês (exceto UI/comentários)
- [ ] Booleanos com prefixo `is/has/should/can`
- [ ] Event handlers com prefixo `handle`
- [ ] Hooks com prefixo `use`
- [ ] Componentes em PascalCase
- [ ] Arquivos com nomenclatura correta
- [ ] Imports organizados
- [ ] Constantes em SCREAMING_SNAKE_CASE
- [ ] Comentários explicam "por quê"
- [ ] JSDoc em funções públicas
- [ ] Sem imports não utilizados
- [ ] Formatação consistente (Prettier)

---

**Criado por:** Programador Experiente  
**Data:** 25/06/2026  
**Status:** ✅ ATIVO
