import { logger } from './logger';
import { offlineDatabase } from './offlineDatabase';
import type {
  QueuedOperationData,
  TransactionOperationData,
  EditTransactionOperationData,
  DeleteTransactionOperationData,
  TransferOperationData,
  CreditPaymentOperationData,
  FixedTransactionOperationData,
  InstallmentsOperationData,
  ImportTransactionsOperationData,
  CategoryOperationData,
  EditCategoryOperationData,
  DeleteCategoryOperationData,
  ImportCategoriesOperationData,
  AccountOperationData,
  EditAccountOperationData,
  DeleteAccountOperationData,
  ImportAccountsOperationData,
  ClearAllDataOperationData,
} from '@/types/queueOperations';

export interface QueuedOperation {
  id: string;
  type: 
    | 'transaction' 
    | 'edit' 
    | 'delete' 
    | 'transfer' 
    | 'credit_payment' 
    | 'logout'
    | 'add_fixed_transaction'
    | 'add_installments'
    | 'import_transactions'
    | 'add_category'
    | 'edit_category'
    | 'delete_category'
    | 'import_categories'
    | 'add_account'
    | 'edit_account'
    | 'delete_account'
    | 'import_accounts'
    | 'clear_all_data';
  data: Record<string, unknown>; // ✅ Flexibilizado para evitar erros de tipo
  timestamp: number;
  retries: number;
  status?: 'pending' | 'processing' | 'failed';
  lastError?: string;
}

const STORE_NAME = 'operations-queue';

class OfflineQueueManager {
  
  // ✅ BUG FIX #3: Generate idempotent ID based on content hash
  private generateIdempotentId(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): string {
    // Create deterministic ID based on operation content
    const content = JSON.stringify({
      type: operation.type,
      data: operation.data,
      // Don't include timestamp/random to make it deterministic
    });
    
    // Simple hash function (for better security, use crypto.subtle.digest in production)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Return hash as base36 string with type prefix
    return `${operation.type}-${Math.abs(hash).toString(36)}`;
  }
  
  async enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const db = await offlineDatabase.getDB();

    // ✅ BUG FIX #3: Use content-based idempotent ID
    const idempotentId = this.generateIdempotentId(operation);
    
    // Check if operation already exists
    const existing = await this.getOperationById(idempotentId);
    if (existing) {
      logger.info('Operation already queued (idempotent check), skipping:', idempotentId);
      return;
    }

    const queuedOp: QueuedOperation = {
      ...operation,
      id: idempotentId,
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(queuedOp);

      request.onsuccess = () => {
        logger.info('Operation queued for offline sync:', queuedOp.type);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to queue operation:', request.error);
        reject(request.error);
      };
    });
  }

  async dequeue(id: string): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        logger.info('Operation removed from queue:', id);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to dequeue operation:', request.error);
        reject(request.error);
      };
    });
  }

  async getOperationById(id: string): Promise<QueuedOperation | null> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        logger.error('Failed to get operation:', request.error);
        reject(request.error);
      };
    });
  }

  async getAll(): Promise<QueuedOperation[]> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        logger.error('Failed to get queued operations:', request.error);
        reject(request.error);
      };
    });
  }

  async updateRetries(id: string, retries: number): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.retries = retries;
          const putRequest = store.put(operation);
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async updateData(id: string, data: QueuedOperationData['data']): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.data = data;
          const putRequest = store.put(operation);
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.status = 'failed';
          operation.lastError = error;
          const putRequest = store.put(operation);
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clear(): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        logger.info('Offline queue cleared');
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to clear queue:', request.error);
        reject(request.error);
      };
    });
  }

  async clearFailed(): Promise<number> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const operations = getAllRequest.result || [];
        const failedOps = operations.filter(op => op.status === 'failed');
        
        let deletedCount = 0;
        const deletePromises = failedOps.map(op => {
          return new Promise<void>((res, rej) => {
            const deleteRequest = store.delete(op.id);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              res();
            };
            deleteRequest.onerror = () => rej(deleteRequest.error);
          });
        });

        Promise.all(deletePromises)
          .then(() => {
            logger.info(`Cleared ${deletedCount} failed operations`);
            resolve(deletedCount);
          })
          .catch(reject);
      };

      getAllRequest.onerror = () => {
        logger.error('Failed to clear failed operations:', getAllRequest.error);
        reject(getAllRequest.error);
      };
    });
  }

  async getFailedOperations(): Promise<QueuedOperation[]> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const operations = request.result || [];
        resolve(operations.filter(op => op.status === 'failed'));
      };

      request.onerror = () => {
        logger.error('Failed to get failed operations:', request.error);
        reject(request.error);
      };
    });
  }
}

export const offlineQueue = new OfflineQueueManager();
