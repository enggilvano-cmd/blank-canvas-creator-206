import { logger } from './logger';

/**
 * Idempotency key manager for critical operations
 * Prevents duplicate operations from being executed
 * 
 * Features:
 * - LRU eviction policy when cache exceeds MAX_CACHE_SIZE
 * - Automatic cleanup of expired entries
 * - Memory-safe with bounded cache size
 */
class IdempotencyManager {
  private pendingOperations = new Map<string, Promise<unknown>>();
  private completedOperations = new Map<string, { result: unknown; timestamp: number; lastAccessed: number }>();
  
  // Cache limits to prevent memory leaks
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes (reduced from 5min)

  /**
   * Generate a unique idempotency key based on operation type and parameters
   */
  generateKey(operation: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    return `${operation}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Execute an operation with idempotency protection
   * If the same operation is already in progress, return the existing promise
   * If the operation was recently completed, return the cached result
   * 
   * Features LRU eviction when cache is full
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if operation is already in progress
    const pending = this.pendingOperations.get(key);
    if (pending) {
      logger.info('Idempotency: Returning pending operation', { key });
      return pending as Promise<T>;
    }

    // Check if operation was recently completed
    const completed = this.completedOperations.get(key);
    if (completed) {
      const age = Date.now() - completed.timestamp;
      if (age < this.CACHE_TTL) {
        // Update last accessed time for LRU
        completed.lastAccessed = Date.now();
        logger.info('Idempotency: Returning cached result', { key, age });
        return completed.result as T;
      } else {
        // Expired, remove from cache
        this.completedOperations.delete(key);
      }
    }

    // Check cache size and evict if necessary (before adding new entry)
    if (this.completedOperations.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    // Execute the operation
    const promise = operation()
      .then((result) => {
        // Cache the result with timestamps
        this.completedOperations.set(key, {
          result,
          timestamp: Date.now(),
          lastAccessed: Date.now(),
        });
        
        // Remove from pending
        this.pendingOperations.delete(key);
        
        logger.info('Idempotency: Operation completed', { key });
        return result;
      })
      .catch((error) => {
        // Remove from pending on error
        this.pendingOperations.delete(key);
        logger.error('Idempotency: Operation failed', { key, error });
        throw error;
      });

    // Store as pending
    this.pendingOperations.set(key, promise);
    
    return promise;
  }

  /**
   * Evict least recently used entries when cache is full
   * Removes 10% of entries (those with oldest lastAccessed timestamps)
   * This prevents the cache from growing unbounded
   */
  private evictLRU(): void {
    const evictionCount = Math.floor(this.MAX_CACHE_SIZE * 0.1); // 10% eviction
    
    // Sort by lastAccessed (oldest first)
    const sortedEntries = Array.from(this.completedOperations.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Remove oldest 10%
    const toEvict = sortedEntries.slice(0, evictionCount);
    toEvict.forEach(([key]) => {
      this.completedOperations.delete(key);
    });
    
    logger.info('Idempotency: LRU eviction completed', { 
      evicted: toEvict.length,
      remaining: this.completedOperations.size 
    });
  }

  /**
   * Clear expired cache entries (TTL-based cleanup)
   * Runs periodically to remove stale entries
   */
  cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    this.completedOperations.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        expired.push(key);
      }
    });

    expired.forEach(key => this.completedOperations.delete(key));
    
    if (expired.length > 0) {
      logger.info('Idempotency: Cleaned up expired entries', { count: expired.length });
    }
  }

  /**
   * Manually invalidate a cached result
   */
  invalidate(key: string): void {
    this.completedOperations.delete(key);
    logger.info('Idempotency: Invalidated cache', { key });
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.pendingOperations.clear();
    this.completedOperations.clear();
    logger.info('Idempotency: Cleared all caches');
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    cacheSize: number;
    maxSize: number;
    pendingCount: number;
    utilizationPercent: number;
  } {
    return {
      cacheSize: this.completedOperations.size,
      maxSize: this.MAX_CACHE_SIZE,
      pendingCount: this.pendingOperations.size,
      utilizationPercent: (this.completedOperations.size / this.MAX_CACHE_SIZE) * 100,
    };
  }
}

export const idempotencyManager = new IdempotencyManager();

// Run cleanup every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    idempotencyManager.cleanup();
  }, 60 * 1000);
}

/**
 * Helper hook for generating idempotency keys in components
 */
export function useIdempotencyKey(operation: string, params: Record<string, unknown>): string {
  return idempotencyManager.generateKey(operation, params);
}
