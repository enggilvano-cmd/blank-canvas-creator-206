# Edge Functions Tests

Suite completa de testes para as Edge Functions críticas do PlaniFlow.

## 📋 Estrutura

```
_tests/
├── setup.ts                          # Setup e helpers compartilhados
├── atomic-transaction.test.ts        # Testes de criação de transações
├── atomic-transfer.test.ts           # Testes de transferências
├── atomic-edit-transaction.test.ts   # Testes de edição
├── atomic-delete-transaction.test.ts # Testes de exclusão
└── README.md                         # Esta documentação
```

## 🎯 Cobertura de Testes

### atomic-transaction.test.ts
- ✅ Criação de transação de receita
- ✅ Criação de transação de despesa
- ✅ Transações em cartão de crédito
- ✅ Validação de conta inválida
- ✅ Tratamento de valores negativos
- ✅ Proteção de autenticação
- ✅ **Race conditions**: transações concorrentes na mesma conta

### atomic-transfer.test.ts
- ✅ Transferência entre contas correntes
- ✅ Validação de saldo insuficiente
- ✅ Transferência para cartão de crédito
- ✅ Validação de conta origem = destino
- ✅ **Race conditions**: transferências concorrentes da mesma conta
- ✅ **Rollback**: erro de banco de dados

### atomic-edit-transaction.test.ts
- ✅ Edição de valor da transação
- ✅ Mudança de tipo (receita → despesa)
- ✅ Movimentação entre contas
- ✅ Validação de ID inválido
- ✅ **Race conditions**: edições concorrentes

### atomic-delete-transaction.test.ts
- ✅ Exclusão de receita
- ✅ Exclusão de despesa
- ✅ Validação de ID inválido
- ✅ Exclusão em cartão de crédito
- ✅ **Race conditions**: exclusões concorrentes
- ✅ **Segurança**: prevenção de exclusão não autorizada

## 🚀 Como Executar

### Pré-requisitos

Certifique-se de ter as seguintes variáveis de ambiente configuradas:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Executar todos os testes

```bash
deno test --allow-net --allow-env supabase/functions/_tests/
```

### Executar um arquivo específico

```bash
deno test --allow-net --allow-env supabase/functions/_tests/atomic-transaction.test.ts
```

### Executar com output detalhado

```bash
deno test --allow-net --allow-env --trace-ops supabase/functions/_tests/
```

## 🔍 Cenários de Teste

### 1. Testes Funcionais Básicos
Validam o comportamento esperado em condições normais:
- Criação, edição e exclusão de transações
- Cálculos corretos de saldo
- Transferências entre contas

### 2. Testes de Validação
Garantem que entradas inválidas são rejeitadas:
- IDs inexistentes
- Contas inválidas
- Valores negativos
- Saldo insuficiente

### 3. Testes de Segurança
Verificam controles de acesso:
- Autenticação obrigatória
- Prevenção de acesso a dados de outros usuários
- Validação de permissões

### 4. Testes de Race Conditions
Simulam operações concorrentes para garantir consistência:
- Múltiplas transações simultâneas na mesma conta
- Transferências concorrentes
- Edições e exclusões paralelas

### 5. Testes de Rollback
Verificam que operações falhas não corrompem dados:
- Reversão em caso de erro
- Integridade de saldo mantida
- Transações atômicas

## 📊 Helpers Disponíveis

### Setup Functions
- `createTestUser()` - Cria usuário de teste
- `createTestAccount()` - Cria conta de teste
- `createTestCategory()` - Cria categoria de teste
- `createTestTransaction()` - Cria transação de teste
- `cleanupTestUser()` - Limpa dados de teste

### Query Functions
- `getAccountBalance()` - Obtém saldo atualizado
- `invokeEdgeFunction()` - Invoca edge function
- `getSupabaseClient()` - Cliente Supabase admin

### Assert Functions
- `assertEquals()` - Igualdade
- `assertNotEquals()` - Diferença
- `assertTrue()` - Verdadeiro
- `assertFalse()` - Falso

## 🎨 Exemplo de Teste

```typescript
Deno.test('should create income transaction', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Test Income',
        amount: 5000,
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    
    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 15000, 'Balance should increase');
  } finally {
    await cleanupTestUser(user.id);
  }
});
```

## 🐛 Debugging

### Ver logs detalhados
```bash
deno test --allow-net --allow-env --log-level=debug supabase/functions/_tests/
```

### Executar um teste específico
```bash
deno test --allow-net --allow-env --filter="should create income" supabase/functions/_tests/
```

## 📝 Notas Importantes

1. **Cleanup**: Todos os testes limpam dados automaticamente no `finally`
2. **Isolamento**: Cada teste cria seus próprios usuários e dados
3. **Concorrência**: Testes de race condition usam `Promise.all()`
4. **Autenticação**: Testes usam service role key para criar usuários

## 🔐 Segurança

- Nunca commitar credenciais nos testes
- Usar variáveis de ambiente
- Service role key apenas para testes
- Dados de teste isolados por usuário

## ✅ Checklist de Cobertura

- [x] Operações CRUD básicas
- [x] Validações de entrada
- [x] Controles de acesso
- [x] Race conditions
- [x] Rollback em erro
- [x] Diferentes tipos de conta
- [x] Transações pendentes/completadas
- [x] Movimentações entre contas
- [ ] Testes de performance
- [ ] Testes de carga
