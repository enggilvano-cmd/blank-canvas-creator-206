import { logger } from './logger';

/**
 * SafeStorage - Wrapper robusto para localStorage com error handling
 * 
 * Trata automaticamente:
 * - QuotaExceededError (storage cheio)
 * - JSON.parse errors (dados corrompidos)
 * - localStorage indisponível (private browsing, etc.)
 * - Fallback para memória quando necessário
 * - Limite de espaço com LRU eviction
 */

// Configuração de limite de espaço
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limite (conservador para compatibilidade)
const CRITICAL_THRESHOLD = MAX_STORAGE_SIZE * 0.9; // 90% = crítico

// Fallback em memória quando localStorage não disponível
const memoryStorage = new Map<string, string>();
const accessTimestamps = new Map<string, number>(); // Para LRU eviction

const recordAccessTimestamp = (key: string) => {
  accessTimestamps.set(key, Date.now());
};

const removeAccessTimestamp = (key: string) => {
  accessTimestamps.delete(key);
};

/**
 * Verifica se localStorage está disponível
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

const storageAvailable = isLocalStorageAvailable();

if (!storageAvailable) {
  logger.warn('localStorage não disponível, usando fallback em memória');
}

/**
 * SafeStorage API
 */
export const safeStorage = {
  /**
   * Obtém um item do storage
   * Retorna null se o item não existir ou houver erro
   */
  getItem(key: string): string | null {
    try {
      if (storageAvailable) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          recordAccessTimestamp(key);
        }
        return value;
      }
      const value = memoryStorage.get(key) || null;
      if (value !== null) {
        recordAccessTimestamp(key);
      }
      return value;
    } catch (error) {
      logger.error(`SafeStorage.getItem error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Define um item no storage
   * Retorna true se sucesso, false se erro
   */
  setItem(key: string, value: string): boolean {
    try {
      if (storageAvailable) {
        localStorage.setItem(key, value);
        accessTimestamps.set(key, Date.now());
      } else {
        memoryStorage.set(key, value);
        accessTimestamps.set(key, Date.now());
      }
      return true;
    } catch (error) {
      // QuotaExceededError - storage cheio
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        logger.error(`SafeStorage.setItem QuotaExceededError for key "${key}". Aplicando LRU eviction...`);
        
        // LRU eviction: remover itens menos usados
        evictLRU();
        
        // Tentar novamente
        try {
          if (storageAvailable) {
            localStorage.setItem(key, value);
            recordAccessTimestamp(key);
          } else {
            memoryStorage.set(key, value);
            recordAccessTimestamp(key);
          }
          return true;
        } catch (retryError) {
          logger.error(`SafeStorage.setItem falhou após LRU eviction:`, retryError);
          
          // Última tentativa: limpar cache agressivamente
          clearOldCacheItemsInternal();
          
          try {
            if (storageAvailable) {
              localStorage.setItem(key, value);
              recordAccessTimestamp(key);
            } else {
              memoryStorage.set(key, value);
              recordAccessTimestamp(key);
            }
            return true;
          } catch (finalError) {
            logger.error(`SafeStorage.setItem falhou permanentemente:`, finalError);
            return false;
          }
        }
      }
      
      logger.error(`SafeStorage.setItem error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Remove um item do storage
   */
  removeItem(key: string): void {
    try {
      if (storageAvailable) {
        localStorage.removeItem(key);
      } else {
        memoryStorage.delete(key);
      }
      removeAccessTimestamp(key);
    } catch (error) {
      logger.error(`SafeStorage.removeItem error for key "${key}":`, error);
    }
  },

  /**
   * Limpa todo o storage
   */
  clear(): void {
    try {
      if (storageAvailable) {
        localStorage.clear();
      } else {
        memoryStorage.clear();
      }
      accessTimestamps.clear();
    } catch (error) {
      logger.error('SafeStorage.clear error:', error);
    }
  },

  /**
   * Obtém um item JSON do storage
   * Retorna null se o item não existir, for inválido ou houver erro
   */
  getJSON<T>(key: string): T | null {
    try {
      const item = this.getItem(key);
      if (!item) return null;
      
      return JSON.parse(item) as T;
    } catch (error) {
      logger.error(`SafeStorage.getJSON parse error for key "${key}":`, error);
      // Remover item corrompido
      this.removeItem(key);
      return null;
    }
  },

  /**
   * Define um item JSON no storage
   * Retorna true se sucesso, false se erro
   */
  setJSON<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify(value);
      return this.setItem(key, serialized);
    } catch (error) {
      logger.error(`SafeStorage.setJSON stringify error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Limpa itens antigos do cache (heurística: items com "cache" no nome)
   * Usado quando QuotaExceededError ocorre
   */
  clearOldCacheItems(): void {
    clearOldCacheItemsInternal();
  },

  /**
   * Verifica se o storage está disponível
   */
  isAvailable(): boolean {
    return storageAvailable;
  },

  /**
   * Obtém o tamanho aproximado do storage em uso (bytes)
   */
  getUsedSpace(): number {
    try {
      if (!storageAvailable) {
        // Calcular tamanho do memoryStorage
        let size = 0;
        memoryStorage.forEach((value, key) => {
          size += key.length + value.length;
        });
        return size;
      }

      let size = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          size += key.length + (value?.length || 0);
        }
      }
      return size;
    } catch (error) {
      logger.error('SafeStorage.getUsedSpace error:', error);
      return 0;
    }
  },

  /**
   * Verifica se está próximo do limite (> 80% do típico 5-10MB)
   */
  isNearCapacity(): boolean {
    const used = this.getUsedSpace();
    const typical5MB = 5 * 1024 * 1024;
    return used > typical5MB * 0.8;
  },
};

function clearOldCacheItemsInternal(): void {
  try {
    const keysToRemove: string[] = [];
    
    if (storageAvailable) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('cache') || key.includes('query-') || key.includes('temp-'))) {
          keysToRemove.push(key);
        }
      }
    } else {
      for (const key of memoryStorage.keys()) {
        if (key.includes('cache') || key.includes('query-') || key.includes('temp-')) {
          keysToRemove.push(key);
        }
      }
    }

    const itemsToRemove = Math.min(keysToRemove.length, Math.ceil(keysToRemove.length * 0.5));
    for (let i = 0; i < itemsToRemove; i++) {
      const key = keysToRemove[i];
      if (!key) continue;
      if (storageAvailable) {
        localStorage.removeItem(key);
      } else {
        memoryStorage.delete(key);
      }
      removeAccessTimestamp(key);
    }

    logger.info(`SafeStorage: Limpou ${itemsToRemove} itens de cache antigos`);
  } catch (error) {
    logger.error('SafeStorage.clearOldCacheItems error:', error);
  }
}

function evictLRU(): void {
  try {
    const currentSize = safeStorage.getUsedSpace();
    if (currentSize < CRITICAL_THRESHOLD) {
      return;
    }

    const entries: Array<[string, number]> = [];
    if (storageAvailable) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          entries.push([key, accessTimestamps.get(key) || 0]);
        }
      }
    } else {
      memoryStorage.forEach((_, key) => {
        entries.push([key, accessTimestamps.get(key) || 0]);
      });
    }

    entries.sort((a, b) => a[1] - b[1]);
    const itemsToRemove = Math.min(entries.length, Math.ceil(entries.length * 0.3));
    for (let i = 0; i < itemsToRemove; i++) {
      const [key] = entries[i];
      if (!key) continue;
      if (storageAvailable) {
        localStorage.removeItem(key);
      } else {
        memoryStorage.delete(key);
      }
      removeAccessTimestamp(key);
    }

    logger.info(`SafeStorage: LRU eviction removeu ${itemsToRemove} itens`);
  } catch (error) {
    logger.error('SafeStorage.evictLRU error:', error);
  }
}

// Exportar como default também
export default safeStorage;
