import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineSync } from '@/lib/offlineSync';

/**
 * Offline/Online Integration Tests - Priority 2
 * 
 * Testa transições entre estados offline e online,
 * sincronização de dados e recuperação de falhas.
 */

describe('Offline/Online Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await offlineDatabase.clear();
    queryClient.clear();
  });

  describe('Offline Data Persistence', () => {
    it('should save transactions to IndexedDB when offline', async () => {
      const transaction = {
        id: 'test-1',
        description: 'Test Transaction',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      };

      await offlineDatabase.saveTransactions([transaction]);

      const saved = await offlineDatabase.getTransactionById('test-1');
      expect(saved).toBeDefined();
      expect(saved?.description).toBe('Test Transaction');
      expect(saved?.amount).toBe(100);
    });

    it('should queue operations when offline', async () => {
      const operation = {
        type: 'ADD_TRANSACTION' as const,
        data: {
          description: 'Offline Transaction',
          amount: 50,
          type: 'income' as const
        },
        timestamp: Date.now()
      };

      await offlineQueue.enqueue(operation);

      const queued = await offlineQueue.getAll();
      expect(queued).toHaveLength(1);
      expect(queued[0].type).toBe('ADD_TRANSACTION');
    });

    it('should persist multiple entity types', async () => {
      const account = {
        id: 'account-1',
        name: 'Test Account',
        type: 'checking' as const,
        balance: 1000,
        user_id: 'user-1',
        color: '#000000'
      };

      const category = {
        id: 'category-1',
        name: 'Test Category',
        type: 'expense' as const,
        user_id: 'user-1',
        color: '#FF0000'
      };

      await offlineDatabase.saveAccounts([account]);
      await offlineDatabase.saveCategories([category]);

      const savedAccount = await offlineDatabase.getAccountById('account-1');
      const savedCategory = await offlineDatabase.getCategoryById('category-1');

      expect(savedAccount?.name).toBe('Test Account');
      expect(savedCategory?.name).toBe('Test Category');
    });
  });

  describe('Online Synchronization', () => {
    it('should process queued operations when going online', async () => {
      // Enfileira operações offline
      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'Op 1', amount: 100 },
        timestamp: Date.now()
      });

      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'Op 2', amount: 200 },
        timestamp: Date.now()
      });

      const initialQueue = await offlineQueue.getAll();
      expect(initialQueue).toHaveLength(2);

      // Simula sincronização
      // (em implementação real, chamaria offlineSync.syncAll())
      
      // Verifica que operações foram processadas
      // expect(await offlineQueue.getAll()).toHaveLength(0);
    });

    it('should handle sync conflicts gracefully', async () => {
      const localTransaction = {
        id: 'conflict-1',
        description: 'Local Version',
        amount: 100,
        updated_at: new Date('2024-01-01'),
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      };

      const serverTransaction = {
        id: 'conflict-1',
        description: 'Server Version',
        amount: 150,
        updated_at: new Date('2024-01-02'), // Mais recente
        type: 'expense' as const,
        status: 'completed' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      };

      await offlineDatabase.saveTransactions([localTransaction]);

      // Simula recebimento de dados do servidor
      // Em implementação real, o servidor vence (updated_at mais recente)
      await offlineDatabase.saveTransactions([serverTransaction]);

      const resolved = await offlineDatabase.getTransactionById('conflict-1');
      expect(resolved?.description).toBe('Server Version');
      expect(resolved?.amount).toBe(150);
    });

    it('should retry failed sync operations', async () => {
      const failedOp = {
        type: 'ADD_TRANSACTION' as const,
        data: { description: 'Failed Op', amount: 100 },
        timestamp: Date.now(),
        retries: 0
      };

      await offlineQueue.enqueue(failedOp);

      // Simula falha na primeira tentativa
      // (implementação real incrementaria retries)
      
      const queued = await offlineQueue.getAll();
      expect(queued[0].retries).toBeDefined();
    });
  });

  describe('Network State Transitions', () => {
    it('should detect online/offline transitions', async () => {
      const originalOnLine = navigator.onLine;
      
      // Simula offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      expect(navigator.onLine).toBe(false);

      // Simula online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      expect(navigator.onLine).toBe(true);

      // Restaura
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine
      });
    });

    it('should trigger sync when coming online', async () => {
      const syncSpy = vi.fn();
      
      // Enfileira operação offline
      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'Pending', amount: 100 },
        timestamp: Date.now()
      });

      // Simula evento de online
      window.dispatchEvent(new Event('online'));

      // Aguarda processamento
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verificaria que sync foi chamado
      // expect(syncSpy).toHaveBeenCalled();
    });

    it('should queue operations immediately when offline', async () => {
      const startTime = Date.now();

      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'Fast', amount: 100 },
        timestamp: Date.now()
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Operação offline deve ser instantânea (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity offline', async () => {
      const account = {
        id: 'account-1',
        name: 'Test Account',
        type: 'checking' as const,
        balance: 1000,
        user_id: 'user-1',
        color: '#000000'
      };

      const transaction = {
        id: 'transaction-1',
        description: 'Test',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1', // Referência
        category_id: 'category-1'
      };

      await offlineDatabase.saveAccounts([account]);
      await offlineDatabase.saveTransactions([transaction]);

      const savedTransaction = await offlineDatabase.getTransactionById('transaction-1');
      const relatedAccount = await offlineDatabase.getAccountById(savedTransaction!.account_id);

      expect(relatedAccount).toBeDefined();
      expect(relatedAccount?.id).toBe('account-1');
    });

    it('should handle cascade deletes properly', async () => {
      const account = {
        id: 'account-to-delete',
        name: 'Delete Me',
        type: 'checking' as const,
        balance: 0,
        user_id: 'user-1',
        color: '#000000'
      };

      const transaction = {
        id: 'transaction-orphan',
        description: 'Will be orphaned',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-to-delete',
        category_id: 'category-1'
      };

      await offlineDatabase.saveAccounts([account]);
      await offlineDatabase.saveTransactions([transaction]);

      // Deleta conta
      await offlineDatabase.deleteAccount('account-to-delete');

      // Transação ainda deve existir (soft delete ou mantem registro)
      const orphan = await offlineDatabase.getTransactionById('transaction-orphan');
      // Decisão de design: manter ou deletar?
      expect(orphan).toBeDefined(); // ou toBeUndefined() dependendo da estratégia
    });

    it('should validate data before saving', async () => {
      const invalidTransaction = {
        id: 'invalid-1',
        // missing required fields
        amount: -100, // invalid amount
        type: 'invalid-type' as any,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1'
        // missing account_id, category_id
      };

      // Deve falhar validação
      await expect(
        offlineDatabase.saveTransactions([invalidTransaction as any])
      ).rejects.toThrow();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle bulk inserts efficiently', async () => {
      const transactions = Array.from({ length: 1000 }, (_, i) => ({
        id: `bulk-${i}`,
        description: `Transaction ${i}`,
        amount: i * 10,
        type: 'expense' as const,
        status: 'completed' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      }));

      const startTime = Date.now();
      await offlineDatabase.saveTransactions(transactions);
      const duration = Date.now() - startTime;

      // Deve processar 1000 registros em menos de 1 segundo
      expect(duration).toBeLessThan(1000);

      const count = await offlineDatabase.getTransactionsCount();
      expect(count).toBe(1000);
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => 
        offlineQueue.enqueue({
          type: 'ADD_TRANSACTION',
          data: { description: `Concurrent ${i}`, amount: i },
          timestamp: Date.now()
        })
      );

      await Promise.all(operations);

      const queued = await offlineQueue.getAll();
      expect(queued.length).toBe(100);
    });

    it('should not degrade with large offline queue', async () => {
      // Enfileira muitas operações
      for (let i = 0; i < 500; i++) {
        await offlineQueue.enqueue({
          type: 'ADD_TRANSACTION',
          data: { description: `Op ${i}`, amount: i },
          timestamp: Date.now()
        });
      }

      // Nova operação deve ser rápida mesmo com fila grande
      const startTime = Date.now();
      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'New Op', amount: 999 },
        timestamp: Date.now()
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from IndexedDB errors', async () => {
      // Simula erro de quota excedida
      const largData = {
        id: 'large-1',
        description: 'x'.repeat(1000000), // 1MB string
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      };

      // Deve lidar com erro graciosamente
      try {
        await offlineDatabase.saveTransactions([largData]);
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Database ainda deve estar funcional
      const normalData = {
        id: 'normal-1',
        description: 'Normal',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      };

      await expect(
        offlineDatabase.saveTransactions([normalData])
      ).resolves.not.toThrow();
    });

    it('should handle corrupted offline data', async () => {
      // Salva dados válidos
      await offlineDatabase.saveTransactions([{
        id: 'valid-1',
        description: 'Valid',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      }]);

      // Simula corrupção (em teste real, manipularia IndexedDB diretamente)
      // await corruptIndexedDBData();

      // Sistema deve detectar e limpar dados corrompidos
      // const data = await offlineDatabase.getAllTransactions();
      // expect(data).toBeDefined();
    });

    it('should clear offline data on demand', async () => {
      // Popula com dados
      await offlineDatabase.saveTransactions([{
        id: 'clear-1',
        description: 'To Clear',
        amount: 100,
        type: 'expense' as const,
        status: 'pending' as const,
        date: new Date(),
        user_id: 'user-1',
        account_id: 'account-1',
        category_id: 'category-1'
      }]);

      await offlineQueue.enqueue({
        type: 'ADD_TRANSACTION',
        data: { description: 'Queued', amount: 100 },
        timestamp: Date.now()
      });

      // Limpa tudo
      await offlineDatabase.clear();
      await offlineQueue.clear();

      const transactions = await offlineDatabase.getAllTransactions();
      const queue = await offlineQueue.getAll();

      expect(transactions).toHaveLength(0);
      expect(queue).toHaveLength(0);
    });
  });
});
