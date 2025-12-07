# Testes de Integração - Sistema Contábil

## 📋 Descrição

Testes automatizados para validar a integridade contábil do sistema, especialmente:
- Criação de journal_entries (partidas dobradas)
- Balanceamento de débitos e créditos
- Operações atômicas (pagamentos, transferências)

## 🚀 Executar Testes

```bash
# Todos os testes
npm test

# Apenas testes de integração
npm test src/test/integration

# Apenas testes unitários
npm test src/test/unit

# Com UI interativa
npm run test:ui

# Com cobertura
npm run test -- --coverage
```

## ⚠️ Pré-requisitos

### Variáveis de Ambiente
Certifique-se de que as seguintes variáveis estão configuradas:

```env
VITE_SUPABASE_URL=https://sdberrkfwoozezletfuq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

### Banco de Dados
Os testes de integração requerem:
- Tabela `journal_entries` existente
- Função `validate_double_entry` disponível
- Edge functions deployadas (`atomic-transaction`, `atomic-transfer`, `atomic-pay-bill`)

## 📊 Estrutura dos Testes

### Testes de Integração (`accounting.test.ts`)
Valida operações reais no banco de dados:

1. **Transação Simples (Income)**
   - Cria transação de receita
   - Valida journal_entries criados
   - Verifica débitos = créditos

2. **Transação Simples (Expense)**
   - Cria transação de despesa
   - Valida lançamentos contábeis

3. **Transferência entre Contas**
   - Cria duas contas
   - Executa transferência atômica
   - Valida partidas dobradas

4. **Pagamento de Fatura**
   - Simula pagamento de cartão de crédito
   - Valida lançamentos em liability e asset

5. **Validação via RPC**
   - Testa função `validate_double_entry` do DB
   - Confirma que retorna balanceamento correto

6. **Múltiplas Operações**
   - Executa várias transações sequenciais
   - Valida balanceamento geral

### Testes Unitários (`accounting-validation.test.ts`)
Valida lógica de cálculo sem dependência de DB:

- Validação de income/expense
- Transferências
- Pagamentos de fatura
- Múltiplas entradas
- Edge cases (zeros, arrays vazios)
- Cenários reais (salário, compras, investimentos)
- Precisão decimal

## ✅ Critérios de Sucesso

Todos os testes devem passar com:

```
✓ Débitos = Créditos em TODAS as operações
✓ Journal entries criados para TODAS as transações
✓ Validação via RPC retorna is_valid = true
✓ Nenhuma operação deixa o sistema desbalanceado
```

## 🐛 Debugging

Se um teste falhar:

1. **Verifique os logs das edge functions:**
   ```bash
   # Ver logs da função específica
   https://supabase.com/dashboard/project/sdberrkfwoozezletfuq/functions/atomic-transaction/logs
   ```

2. **Inspecione os journal_entries:**
   ```sql
   SELECT * FROM journal_entries 
   WHERE transaction_id = 'xxx' 
   ORDER BY entry_type;
   ```

3. **Execute validate_double_entry manualmente:**
   ```sql
   SELECT * FROM validate_double_entry('transaction-id-here');
   ```

4. **Verifique o balanceamento:**
   ```sql
   SELECT 
     transaction_id,
     SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debits,
     SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credits
   FROM journal_entries
   GROUP BY transaction_id
   HAVING SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) != 
          SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END);
   ```

## 📈 Cobertura de Testes

Meta: **> 80% de cobertura** nas funções contábeis críticas

Áreas cobertas:
- ✅ Criação de journal_entries
- ✅ Validação de partidas dobradas
- ✅ Operações atômicas (edge functions)
- ✅ Cálculo de débitos/créditos
- ⚠️ Reconciliação bancária (pendente)
- ⚠️ Fechamento de período (pendente)

## 🔄 CI/CD

Os testes são executados automaticamente:
- Em cada pull request
- Antes de deploy para produção
- Diariamente (smoke tests)

## 📝 Adicionar Novos Testes

Template para novos testes:

```typescript
describe('Nova Funcionalidade', () => {
  it('should create balanced journal entries', async () => {
    // 1. Setup
    const testData = { ... };
    
    // 2. Execute
    const { data, error } = await supabase.functions.invoke('...', {
      body: testData
    });
    
    // 3. Verify
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    
    // 4. Validate Accounting
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('transaction_id', data.transaction.id);
      
    const debits = entries.filter(e => e.entry_type === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);
    const credits = entries.filter(e => e.entry_type === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);
      
    expect(debits).toBe(credits); // CRÍTICO
  });
});
```

## 🎯 Boas Práticas

1. **Sempre limpar dados de teste** no `afterAll`
2. **Usar `await new Promise(resolve => setTimeout(resolve, 500))`** após edge functions (aguardar triggers)
3. **Validar TODOS os lançamentos** (não apenas o primeiro)
4. **Testar cenários de erro** (rollback, validações)
5. **Usar valores inteiros** (centavos) para evitar problemas de precisão

## 📚 Referências

- [Vitest Documentation](https://vitest.dev/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)
- [Princípios Contábeis - Partidas Dobradas](https://pt.wikipedia.org/wiki/Partidas_dobradas)
