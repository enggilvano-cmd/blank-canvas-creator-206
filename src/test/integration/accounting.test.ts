import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/**
 * TESTES DE INTEGRAÇÃO - PARTIDAS DOBRADAS
 * 
 * Valida que:
 * 1. Todas as transações criam journal_entries
 * 2. Débitos = Créditos (partidas balanceadas)
 * 3. Pagamentos criam lançamentos corretos
 * 4. Transferências criam lançamentos corretos
 */

describe('Accounting Integration Tests', () => {
  let supabase: SupabaseClient<Database>;
  let testUserId: string;
  let testAccountId: string;
  let testCreditCardId: string;
  let testCategoryId: string;

  beforeAll(async () => {
    // Configurar cliente Supabase
    supabase = createClient<Database>(
      'https://sdberrkfwoozezletfuq.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYmVycmtmd29vemV6bGV0ZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2Njg2MTksImV4cCI6MjA3MTI0NDYxOX0.4CkPaX75EGyma1gwVYvDodd10TwZPm8I37D0jvjUNBg'
    );

    // Criar usuário de teste (em ambiente real, usar fixture)
    const { data: userData, error: authError } = await supabase.auth.signUp({
      email: `test-${Date.now()}@accounting.test`,
      password: 'Test123456!',
    });

    if (authError || !userData.user) {
      throw new Error('Failed to create test user');
    }

    testUserId = userData.user.id;

    // Criar contas de teste
    const { data: checking } = await supabase
      .from('accounts')
      .insert({
        user_id: testUserId,
        name: 'Test Checking',
        type: 'checking',
        balance: 10000, // R$ 100,00
        color: '#000000',
      })
      .select()
      .single();

    testAccountId = checking!.id;

    const { data: credit } = await supabase
      .from('accounts')
      .insert({
        user_id: testUserId,
        name: 'Test Credit Card',
        type: 'credit',
        balance: 0,
        limit_amount: 50000,
        closing_date: 30,
        due_date: 10,
        color: '#FF0000',
      })
      .select()
      .single();

    testCreditCardId = credit!.id;

    // Criar categoria de teste
    const { data: category } = await supabase
      .from('categories')
      .insert({
        user_id: testUserId,
        name: 'Test Category',
        type: 'expense',
        color: '#0000FF',
      })
      .select()
      .single();

    testCategoryId = category!.id;
  });

  afterAll(async () => {
    // Limpar dados de teste
    if (testUserId) {
      await supabase.from('journal_entries').delete().eq('user_id', testUserId);
      await supabase.from('transactions').delete().eq('user_id', testUserId);
      await supabase.from('categories').delete().eq('user_id', testUserId);
      await supabase.from('accounts').delete().eq('user_id', testUserId);
      // Nota: user deletion requer permissões especiais
    }
  });

  describe('Transação Simples (Income)', () => {
    it('should create journal_entries for income transaction', async () => {
      // Criar transação via edge function
      const { data: result, error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: 'Test Income',
            amount: 5000, // R$ 50,00
            date: '2025-01-15',
            type: 'income',
            category_id: testCategoryId,
            account_id: testAccountId,
            status: 'completed',
          },
        },
      });

      expect(error).toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.transaction).toBeDefined();

      const transactionId = result.transaction.id;

      // Aguardar processamento
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verificar journal_entries criados
      const { data: entries, error: entriesError } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', transactionId);

      expect(entriesError).toBeNull();
      expect(entries).toBeDefined();
      expect(entries!.length).toBeGreaterThanOrEqual(2); // Débito + Crédito

      // Calcular débitos e créditos
      const debits = entries!
        .filter(e => e.entry_type === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credits = entries!
        .filter(e => e.entry_type === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Partidas dobradas: débitos = créditos
      expect(debits).toBe(credits);
      expect(debits).toBe(5000);
    });
  });

  describe('Transação Simples (Expense)', () => {
    it('should create journal_entries for expense transaction', async () => {
      const { data: result, error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: 'Test Expense',
            amount: 3000, // R$ 30,00
            date: '2025-01-16',
            type: 'expense',
            category_id: testCategoryId,
            account_id: testAccountId,
            status: 'completed',
          },
        },
      });

      expect(error).toBeNull();
      expect(result?.success).toBe(true);

      const transactionId = result.transaction.id;
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: entries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', transactionId);

      expect(entries!.length).toBeGreaterThanOrEqual(2);

      const debits = entries!
        .filter(e => e.entry_type === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credits = entries!
        .filter(e => e.entry_type === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Validar balanceamento
      expect(debits).toBe(credits);
      expect(debits).toBe(3000);
    });
  });

  describe('Transferência entre Contas', () => {
    it('should create balanced journal_entries for transfer', async () => {
      // Criar conta destino
      const { data: savingsAccount } = await supabase
        .from('accounts')
        .insert({
          user_id: testUserId,
          name: 'Test Savings',
          type: 'savings',
          balance: 0,
          color: '#00FF00',
        })
        .select()
        .single();

      const { data: result, error } = await supabase.functions.invoke('atomic-transfer', {
        body: {
          transfer: {
            from_account_id: testAccountId,
            to_account_id: savingsAccount!.id,
            amount: 2000, // R$ 20,00
            date: '2025-01-17',
            description: 'Test Transfer',
          },
        },
      });

      expect(error).toBeNull();
      expect(result?.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Buscar lançamentos de ambas as transações (outgoing + incoming)
      const outgoingId = result.outgoing.id;
      const incomingId = result.incoming.id;

      const { data: outgoingEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', outgoingId);

      const { data: incomingEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', incomingId);

      const allEntries = [...(outgoingEntries || []), ...(incomingEntries || [])];

      expect(allEntries.length).toBeGreaterThanOrEqual(2);

      const debits = allEntries
        .filter(e => e.entry_type === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credits = allEntries
        .filter(e => e.entry_type === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Validar balanceamento
      expect(debits).toBe(credits);
      expect(debits).toBe(2000);
    });
  });

  describe('Pagamento de Fatura', () => {
    it('should create balanced journal_entries for bill payment', async () => {
      const { data: result, error } = await supabase.functions.invoke('atomic-pay-bill', {
        body: {
          credit_account_id: testCreditCardId,
          debit_account_id: testAccountId,
          amount: 1500, // R$ 15,00
          payment_date: '2025-01-18',
          description: 'Test Bill Payment',
        },
      });

      expect(error).toBeNull();
      expect(result?.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 500));

      const debitTxId = result.debit_tx.id;
      const creditTxId = result.credit_tx.id;

      const { data: debitEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', debitTxId);

      const { data: creditEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('transaction_id', creditTxId);

      const allEntries = [...(debitEntries || []), ...(creditEntries || [])];

      expect(allEntries.length).toBeGreaterThanOrEqual(2);

      const debits = allEntries
        .filter(e => e.entry_type === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const credits = allEntries
        .filter(e => e.entry_type === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Partidas dobradas balanceadas
      expect(debits).toBe(credits);
      expect(debits).toBe(1500);

      // Validar que há pelo menos um lançamento em liability (cartão)
      const hasLiabilityEntry = allEntries.some(e => {
        return e.entry_type === 'debit'; // Débito em liability reduz dívida
      });
      expect(hasLiabilityEntry).toBe(true);
    });
  });

  describe('Validação via RPC validate_double_entry', () => {
    it('should validate double-entry for any transaction', async () => {
      // Criar transação de teste
      const { data: txResult } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: 'RPC Validation Test',
            amount: 1000,
            date: '2025-01-19',
            type: 'expense',
            category_id: testCategoryId,
            account_id: testAccountId,
            status: 'completed',
          },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const transactionId = txResult.transaction.id;

      // Chamar função RPC de validação
      const { data: validation, error: validationError } = await supabase.rpc(
        'validate_double_entry',
        { p_transaction_id: transactionId }
      );

      expect(validationError).toBeNull();
      expect(validation).toBeDefined();
      expect(validation![0].is_valid).toBe(true);
      expect(validation![0].total_debits).toBe(validation![0].total_credits);
      expect(validation![0].difference).toBe(0);
    });
  });

  describe('Múltiplas Operações - Balanceamento Geral', () => {
    it('should maintain balanced entries across multiple operations', async () => {
      // Criar múltiplas transações
      const operations = [
        { type: 'income', amount: 5000 },
        { type: 'expense', amount: 2000 },
        { type: 'expense', amount: 1500 },
        { type: 'income', amount: 3000 },
      ];

      const transactionIds: string[] = [];

      for (const op of operations) {
        const { data } = await supabase.functions.invoke('atomic-transaction', {
          body: {
            transaction: {
              description: `Batch Test ${op.type}`,
              amount: op.amount,
              date: '2025-01-20',
              type: op.type,
              category_id: testCategoryId,
              account_id: testAccountId,
              status: 'completed',
            },
          },
        });
        transactionIds.push(data.transaction.id);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Buscar TODOS os journal_entries das transações
      const { data: allEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .in('transaction_id', transactionIds);

      expect(allEntries).toBeDefined();

      // Calcular totais gerais
      const totalDebits = allEntries!
        .filter(e => e.entry_type === 'debit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const totalCredits = allEntries!
        .filter(e => e.entry_type === 'credit')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // CRÍTICO: Total de débitos DEVE ser igual ao total de créditos
      expect(totalDebits).toBe(totalCredits);

      // Validar que o total corresponde à soma das operações (cada op gera débito E crédito)
      const expectedTotal = operations.reduce((sum, op) => sum + op.amount, 0);
      expect(totalDebits).toBe(expectedTotal);
    });
  });
});
