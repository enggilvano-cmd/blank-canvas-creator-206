import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';
import { getMonthsAgoUTC } from './timezone';

const DB_NAME = 'planiflow-offline';
// MUDANÇA CRÍTICA: Incrementado para 3 para forçar atualização da estrutura no navegador do usuário
const DB_VERSION = 3;

const STORES = {
  TRANSACTIONS: 'transactions',
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  OPERATIONS_QUEUE: 'operations-queue',
  METADATA: 'metadata',
} as const;

// ✅ BUG FIX #8: IndexedDB quota management
const MAX_STORAGE_USAGE_PERCENT = 80; // Alert when 80% full
const EVICTION_TARGET_PERCENT = 60; // Evict down to 60% when full

class OfflineDatabase {
  private db: IDBDatabase | null = null;

  /**
   * ✅ BUG FIX #8: Check storage quota to prevent QuotaExceededError
   */
  async checkStorageQuota(): Promise<{ usage: number; quota: number; percent: number; available: boolean }> {
    if (!('storage' in navigator && 'estimate' in navigator.storage)) {
      // Fallback for browsers without Storage API
      return { usage: 0, quota: Infinity, percent: 0, available: true };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || Infinity;
      const percent = quota > 0 ? (usage / quota) * 100 : 0;
      const available = percent < MAX_STORAGE_USAGE_PERCENT;

      if (percent > MAX_STORAGE_USAGE_PERCENT) {
        logger.warn(`Storage quota critical: ${percent.toFixed(1)}% used (${this.formatBytes(usage)} / ${this.formatBytes(quota)})`);
      }

      return { usage, quota, percent, available };
    } catch (error) {
      logger.error('Failed to check storage quota:', error);
      return { usage: 0, quota: Infinity, percent: 0, available: true };
    }
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * ✅ BUG FIX #8: Evict old data when storage is full (LRU strategy)
   */
  async evictOldData(): Promise<void> {
    if (!this.db) await this.init();

    logger.info('Starting LRU eviction of old data...');

    try {
      // ✅ BUG FIX #12: Use UTC for eviction
      // Evict old transactions (keep only last 6 months instead of 12)
      const cutoffDateStr = getMonthsAgoUTC(6);
      const cutoffTime = new Date(cutoffDateStr).getTime();

      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);
      const index = store.index('date');

      let deletedCount = 0;
      const request = index.openCursor();

      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const tx = cursor.value as Transaction;
            const txDate = new Date(tx.date).getTime();
            
            if (txDate < cutoffTime) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });

      logger.info(`Evicted ${deletedCount} old transactions to free up space`);
    } catch (error) {
      logger.error('Failed to evict old data:', error);
    }
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info(`IndexedDB (v${DB_VERSION}) initialized successfully`);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        logger.info(`Upgrading Database to version ${DB_VERSION}...`);

        // Transactions store
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
          txStore.createIndex('user_id', 'user_id', { unique: false });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Accounts store
        if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
          const accStore = db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
          accStore.createIndex('user_id', 'user_id', { unique: false });
          accStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          const catStore = db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
          catStore.createIndex('user_id', 'user_id', { unique: false });
          catStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Operations queue store
        if (!db.objectStoreNames.contains(STORES.OPERATIONS_QUEUE)) {
          const opStore = db.createObjectStore(STORES.OPERATIONS_QUEUE, { keyPath: 'id' });
          opStore.createIndex('timestamp', 'timestamp', { unique: false });
          opStore.createIndex('type', 'type', { unique: false });
        }

        // Metadata store (for sync tracking)
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        }
      };
    });
  }

  async getDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  // === MÉTODOS DE SINCRONIZAÇÃO INTELIGENTE ===

  async syncTransactions(transactions: Transaction[], userId: string, dateFrom: string): Promise<void> {
    if (!this.db) await this.init();

    // ✅ BUG FIX #8: Check quota before saving
    const quota = await this.checkStorageQuota();
    if (!quota.available) {
      logger.warn('Storage quota exceeded, evicting old data...');
      await this.evictOldData();
      
      // Check again after eviction
      const quotaAfter = await this.checkStorageQuota();
      if (!quotaAfter.available) {
        throw new Error(`Storage quota exceeded: ${quotaAfter.percent.toFixed(1)}% used`);
      }
    }

    // 1. Read local transactions (readonly) to minimize write lock time
    const localTxs = await new Promise<Transaction[]>((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // 2. Calculate diffs in memory
    const serverIds = new Set(transactions.map(t => t.id));
    // ✅ BUG FIX #12: dateFrom já está em UTC
    const cutoffTime = new Date(dateFrom).getTime();

    const toDelete = localTxs.filter(tx => {
        const txDate = new Date(tx.date).getTime();
        const isInSyncWindow = txDate >= cutoffTime;
        const isOfficialId = !tx.id.startsWith('temp-'); 
        // PROTEÇÃO: Não deletar transações fixas durante o sync de transações normais
        const isFixed = tx.is_fixed === true;
        return isInSyncWindow && isOfficialId && !serverIds.has(tx.id) && !isFixed;
    });

    // Optimization: Only put if changed or new
    const localMap = new Map(localTxs.map(t => [t.id, t]));
    const toPut = transactions.filter(serverTx => {
        const localTx = localMap.get(serverTx.id);
        if (!localTx) return true; // New
        if (serverTx.updated_at && localTx.updated_at) {
            return new Date(serverTx.updated_at).getTime() > new Date(localTx.updated_at).getTime();
        }
        // If no updated_at, assume change (safer) or check deep equality (expensive)
        // Let's assume change to be safe but it's still better than putting everything
        return JSON.stringify(serverTx) !== JSON.stringify(localTx);
    });

    if (toDelete.length === 0 && toPut.length === 0) {
        logger.info('Sync transactions: No changes needed.');
        return;
    }

    // 3. Apply changes (readwrite) - fast!
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);

      toDelete.forEach(tx => store.delete(tx.id));
      toPut.forEach(tx => store.put(tx));

      transaction.oncomplete = () => {
        logger.info(`Sync transactions: Updated ${toPut.length}, deleted ${toDelete.length}.`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async syncFixedTransactions(transactions: Transaction[], userId: string): Promise<void> {
    if (!this.db) await this.init();

    // 1. Read local transactions (readonly)
    const localTxs = await new Promise<Transaction[]>((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // 2. Calculate diffs
    const serverIds = new Set(transactions.map(t => t.id));
    const toDelete = localTxs.filter(tx => {
        const isFixed = tx.is_fixed === true;
        const isParent = tx.parent_transaction_id === null || tx.parent_transaction_id === undefined;
        const isOfficialId = !tx.id.startsWith('temp-');
        return isFixed && isParent && isOfficialId && !serverIds.has(tx.id);
    });

    const localMap = new Map(localTxs.map(t => [t.id, t]));
    const toPut = transactions.filter(serverTx => {
        const localTx = localMap.get(serverTx.id);
        if (!localTx) return true;
        if (serverTx.updated_at && localTx.updated_at) {
            return new Date(serverTx.updated_at).getTime() > new Date(localTx.updated_at).getTime();
        }
        return JSON.stringify(serverTx) !== JSON.stringify(localTx);
    });

    if (toDelete.length === 0 && toPut.length === 0) {
        return;
    }

    // 3. Apply changes (readwrite)
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);

      toDelete.forEach(tx => store.delete(tx.id));
      toPut.forEach(tx => store.put(tx));

      transaction.oncomplete = () => {
        logger.info(`Sync fixed transactions: Updated ${toPut.length}, deleted ${toDelete.length}.`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async syncAccounts(accounts: Account[], userId: string): Promise<void> {
    if (!this.db) await this.init();
    // 1. Read local accounts (readonly)
    const localAccounts = await new Promise<Account[]>((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readonly');
      const store = tx.objectStore(STORES.ACCOUNTS);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // 2. Calculate diffs
    const serverIds = new Set(accounts.map(a => a.id));
    const toDelete = localAccounts.filter(acc => 
      !acc.id.startsWith('temp-') && !serverIds.has(acc.id)
    );

    const localMap = new Map(localAccounts.map(a => [a.id, a]));
    const toPut = accounts.filter(serverAcc => {
        const localAcc = localMap.get(serverAcc.id);
        if (!localAcc) return true;
        // Accounts might not have updated_at in all cases, but let's check
        if (serverAcc.updated_at && localAcc.updated_at) {
            return new Date(serverAcc.updated_at).getTime() > new Date(localAcc.updated_at).getTime();
        }
        return JSON.stringify(serverAcc) !== JSON.stringify(localAcc);
    });

    if (toDelete.length === 0 && toPut.length === 0) {
        return;
    }

    // 3. Apply changes (readwrite)
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = tx.objectStore(STORES.ACCOUNTS);
      
      toDelete.forEach(acc => store.delete(acc.id));
      toPut.forEach(acc => store.put(acc));
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async syncCategories(categories: Category[], userId: string): Promise<void> {
    if (!this.db) await this.init();
    // 1. Read local categories (readonly)
    const localCategories = await new Promise<Category[]>((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readonly');
      const store = tx.objectStore(STORES.CATEGORIES);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // 2. Calculate diffs
    const serverIds = new Set(categories.map(c => c.id));
    const toDelete = localCategories.filter(cat => 
      !cat.id.startsWith('temp-') && !serverIds.has(cat.id)
    );

    const localMap = new Map(localCategories.map(c => [c.id, c]));
    const toPut = categories.filter(serverCat => {
        const localCat = localMap.get(serverCat.id);
        if (!localCat) return true;
        if (serverCat.updated_at && localCat.updated_at) {
            return new Date(serverCat.updated_at).getTime() > new Date(localCat.updated_at).getTime();
        }
        return JSON.stringify(serverCat) !== JSON.stringify(localCat);
    });

    if (toDelete.length === 0 && toPut.length === 0) {
        return;
    }

    // 3. Apply changes (readwrite)
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = tx.objectStore(STORES.CATEGORIES);
      
      toDelete.forEach(cat => store.delete(cat.id));
      toPut.forEach(cat => store.put(cat));
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // === MÉTODOS CRUD ===

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      transactions.forEach(txData => store.put(txData));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getFixedTransactions(userId: string): Promise<Transaction[]> {
    if (!this.db) await this.init();

    // Fetch categories and accounts first to join
    const [categories, accounts] = await Promise.all([
        this.getCategories(userId),
        this.getAccounts(userId)
    ]);

    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const allTransactions = request.result || [];
        // Filtrar apenas transações fixas (is_fixed = true e parent_transaction_id = null)
        const fixedTransactions = allTransactions.filter(txData => 
          txData.is_fixed === true && 
          (txData.parent_transaction_id === null || txData.parent_transaction_id === undefined)
        );

        // Join with categories and accounts
        const enrichedTransactions = fixedTransactions.map(tx => ({
            ...tx,
            category: tx.category_id ? categoryMap.get(tx.category_id) : undefined,
            account: tx.account_id ? accountMap.get(tx.account_id) : undefined
        }));

        enrichedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(enrichedTransactions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Optimized transaction retrieval with lazy loading and virtual indexing
   */
  async getTransactions(userId: string, monthsBack: number = 3, options: {
    limit?: number;
    offset?: number;
    sortBy?: 'date' | 'amount';
    sortOrder?: 'asc' | 'desc';
    useVirtualIndex?: boolean;
  } = {}): Promise<Transaction[]> {
    if (!this.db) await this.init();
    
    const { limit, offset = 0, sortBy = 'date', sortOrder = 'desc', useVirtualIndex = true } = options;
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      
      // Use cursor for better performance on large datasets
      if (useVirtualIndex && (limit || offset > 0)) {
        const results: Transaction[] = [];
        let skipped = 0;
        let collected = 0;
        // ✅ BUG FIX #12: Use UTC for filtering
        const cutoffDateStr = getMonthsAgoUTC(monthsBack);
        const cutoffTime = new Date(cutoffDateStr).getTime();
        
        const request = index.openCursor(IDBKeyRange.only(userId));
        
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            // Sort results in memory (more efficient than sorting entire dataset)
            results.sort((a, b) => {
              const aValue = sortBy === 'date' ? new Date(a.date).getTime() : a.amount;
              const bValue = sortBy === 'date' ? new Date(b.date).getTime() : b.amount;
              return sortOrder === 'desc' ? (bValue - aValue) : (aValue - bValue);
            });
            resolve(results);
            return;
          }
          
          const txData = cursor.value as Transaction;
          const txDate = new Date(txData.date).getTime();
          
          // Filter by date range
          if (txDate >= cutoffTime) {
            // Skip offset records
            if (offset && skipped < offset) {
              skipped++;
            } else if (!limit || collected < limit) {
              results.push(txData);
              collected++;
            } else {
              // We have enough records
              results.sort((a, b) => {
                const aValue = sortBy === 'date' ? new Date(a.date).getTime() : a.amount;
                const bValue = sortBy === 'date' ? new Date(b.date).getTime() : b.amount;
                return sortOrder === 'desc' ? (bValue - aValue) : (aValue - bValue);
              });
              resolve(results);
              return;
            }
          }
          
          cursor.continue();
        };
        
        request.onerror = () => reject(request.error);
      } else {
        // Fallback to original method for small datasets
        const request = index.getAll(userId);
        
        request.onsuccess = () => {
          const allTransactions = request.result || [];
          // ✅ BUG FIX #12: Use UTC for filtering
          const cutoffDateStr = getMonthsAgoUTC(monthsBack);
          const cutoffDate = new Date(cutoffDateStr);
          
          const filtered = allTransactions.filter(txData => {
            const txDate = new Date(txData.date);
            return txDate >= cutoffDate;
          });

          filtered.sort((a, b) => {
            const aValue = sortBy === 'date' ? new Date(a.date).getTime() : a.amount;
            const bValue = sortBy === 'date' ? new Date(b.date).getTime() : b.amount;
            return sortOrder === 'desc' ? (bValue - aValue) : (aValue - bValue);
          });
          
          // Apply pagination if specified
          const result = limit ? filtered.slice(offset, offset + limit) : filtered.slice(offset);
          resolve(result);
        };
        
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Batch operations for better performance on large datasets
   */
  async batchTransactions(operations: Array<{
    type: 'add' | 'update' | 'delete';
    data: Transaction | string; // string for delete (id)
  }>): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      
      let completed = 0;
      const total = operations.length;
      
      const processNext = () => {
        if (completed >= total) {
          resolve();
          return;
        }
        
        const operation = operations[completed];
        let request: IDBRequest;
        
        switch (operation.type) {
          case 'add':
          case 'update':
            request = store.put(operation.data as Transaction);
            break;
          case 'delete':
            request = store.delete(operation.data as string);
            break;
          default:
            completed++;
            processNext();
            return;
        }
        
        request.onsuccess = () => {
          completed++;
          processNext();
        };
        
        request.onerror = () => reject(request.error);
      };
      
      // Start batch processing
      processNext();
      
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get transactions count efficiently without loading all data
   */
  async getTransactionsCount(userId: string, monthsBack: number = 3): Promise<number> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      
      let count = 0;
      // ✅ BUG FIX #12: Use UTC for counting
      const cutoffDateStr = getMonthsAgoUTC(monthsBack);
      const cutoffTime = new Date(cutoffDateStr).getTime();
      
      const request = index.openCursor(IDBKeyRange.only(userId));
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(count);
          return;
        }
        
        const txData = cursor.value as Transaction;
        const txDate = new Date(txData.date).getTime();
        
        if (txDate >= cutoffTime) {
          count++;
        }
        
        cursor.continue();
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveAccounts(accounts: Account[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = tx.objectStore(STORES.ACCOUNTS);
      accounts.forEach(acc => store.put(acc));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAccounts(userId: string): Promise<Account[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readonly');
      const store = tx.objectStore(STORES.ACCOUNTS);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveCategories(categories: Category[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = tx.objectStore(STORES.CATEGORIES);
      categories.forEach(cat => store.put(cat));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCategories(userId: string): Promise<Category[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readonly');
      const store = tx.objectStore(STORES.CATEGORIES);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
       const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
       const req = tx.objectStore(STORES.TRANSACTIONS).get(id);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => resolve(undefined);
    });
  }

  async setLastSync(key: string, timestamp: number): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.METADATA], 'readwrite');
      const store = tx.objectStore(STORES.METADATA);
      store.put({ key, timestamp });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const storeNames = [STORES.TRANSACTIONS, STORES.ACCOUNTS, STORES.CATEGORIES, STORES.METADATA];
      const tx = this.db!.transaction(storeNames, 'readwrite');
      storeNames.forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = () => {
        logger.info('Cleared all offline data');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const offlineDatabase = new OfflineDatabase();