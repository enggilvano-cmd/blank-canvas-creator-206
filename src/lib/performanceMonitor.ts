/**
 * Performance monitoring and optimization utilities
 */

import { logger } from './logger';

interface PerformanceMetrics {
  queryTime: number;
  cacheHits: number;
  cacheMisses: number;
  memoryUsage: number;
  activeConnections: number;
}

class PerformanceMonitor {
  private readonly metrics: PerformanceMetrics = {
    queryTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    memoryUsage: 0,
    activeConnections: 0,
  };

  private queryTimes: number[] = [];
  private readonly connectionPool: Set<string> = new Set();
  private readonly MAX_POOL_SIZE = 10;
  private readonly MAX_QUERY_HISTORY = 100;

  /**
   * Track query performance
   */
  trackQuery(queryKey: string, startTime: number): void {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.queryTimes.push(duration);
    if (this.queryTimes.length > this.MAX_QUERY_HISTORY) {
      this.queryTimes.shift();
    }
    
    this.metrics.queryTime = this.getAverageQueryTime();
    
    // Log slow queries
    if (duration > 1000) { // 1 second threshold
      logger.warn(`Slow query detected: ${queryKey} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Track cache performance
   */
  trackCacheHit(): void {
    this.metrics.cacheHits++;
  }

  trackCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Track memory usage
   */
  trackMemoryUsage(): void {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
    }
  }

  /**
   * Connection pooling simulation
   */
  acquireConnection(connectionId: string): boolean {
    if (this.connectionPool.size >= this.MAX_POOL_SIZE) {
      logger.warn('Connection pool exhausted, rejecting connection');
      return false;
    }
    
    this.connectionPool.add(connectionId);
    this.metrics.activeConnections = this.connectionPool.size;
    return true;
  }

  releaseConnection(connectionId: string): void {
    this.connectionPool.delete(connectionId);
    this.metrics.activeConnections = this.connectionPool.size;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics & {
    cacheHitRatio: number;
    averageQueryTime: number;
    slowQueries: number;
  } {
    const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRatio = totalCacheOps > 0 ? this.metrics.cacheHits / totalCacheOps : 0;
    const slowQueries = this.queryTimes.filter(time => time > 1000).length;
    
    return {
      ...this.metrics,
      cacheHitRatio,
      averageQueryTime: this.getAverageQueryTime(),
      slowQueries,
    };
  }

  /**
   * Performance recommendations based on metrics
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.getMetrics();
    
    if (metrics.cacheHitRatio < 0.7) {
      recommendations.push('Cache hit ratio is low (<70%). Consider increasing staleTime for frequently accessed data.');
    }
    
    if (metrics.averageQueryTime > 500) {
      recommendations.push('Average query time is high (>500ms). Consider implementing query optimization or pagination.');
    }
    
    if (metrics.slowQueries > 5) {
      recommendations.push(`${metrics.slowQueries} slow queries detected. Review query complexity and database indexes.`);
    }
    
    if (metrics.memoryUsage > 100) {
      recommendations.push('Memory usage is high (>100MB). Consider reducing gcTime or implementing data cleanup.');
    }
    
    if (metrics.activeConnections > 8) {
      recommendations.push('High number of active connections. Consider connection pooling optimization.');
    }
    
    return recommendations;
  }

  private getAverageQueryTime(): number {
    if (this.queryTimes.length === 0) return 0;
    return this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    (this.metrics as any).queryTime = 0;
    (this.metrics as any).cacheHits = 0;
    (this.metrics as any).cacheMisses = 0;
    (this.metrics as any).memoryUsage = 0;
    (this.metrics as any).activeConnections = 0;
    this.queryTimes = [];
    this.connectionPool.clear();
  }

  /**
   * Start periodic memory tracking
   */
  startMemoryTracking(intervalMs: number = 30000): void {
    setInterval(() => {
      this.trackMemoryUsage();
    }, intervalMs);
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance decorator for async functions
 */
export function withPerformanceTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  return (async (...args: any[]) => {
    const startTime = performance.now();
    const connectionId = `${name}-${Date.now()}`;
    
    if (!performanceMonitor.acquireConnection(connectionId)) {
      throw new Error('Connection pool exhausted');
    }
    
    try {
      const result = await fn(...args);
      performanceMonitor.trackQuery(name, startTime);
      return result;
    } finally {
      performanceMonitor.releaseConnection(connectionId);
    }
  }) as T;
}

/**
 * Cache performance wrapper for React Query
 */
export function trackCachePerformance<T>(
  data: T | undefined,
  queryKey: string
): T | undefined {
  if (data !== undefined) {
    performanceMonitor.trackCacheHit();
    logger.debug(`Cache hit for query: ${queryKey}`);
  } else {
    performanceMonitor.trackCacheMiss();
    logger.debug(`Cache miss for query: ${queryKey}`);
  }
  
  return data;
}