import * as Sentry from '@sentry/react';
import { logger } from './logger';

/**
 * ✅ PRIORITY 3: Advanced Monitoring & Observability
 * 
 * Comprehensive monitoring solution for production:
 * - Custom metrics tracking
 * - Performance monitoring
 * - Error tracking with context
 * - User session recording
 * - Business metrics
 */

// ============================================
// Configuration
// ============================================

const MONITORING_CONFIG = {
  // Sampling rates
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 10% in prod, 100% in dev
  sessionSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  errorSampleRate: 1.0, // Always capture errors

  // Thresholds
  slowQueryThreshold: 1000, // 1 second
  slowRenderThreshold: 16, // 16ms (1 frame at 60fps)
  longTaskThreshold: 50, // 50ms
  
  // Batch settings
  metricsFlushInterval: 60000, // 1 minute
  maxBatchSize: 100,
} as const;

// ============================================
// Metric Types
// ============================================

interface CustomMetric {
  name: string;
  value: number;
  unit: 'milliseconds' | 'count' | 'bytes' | 'percentage';
  tags?: Record<string, string>;
  timestamp?: number;
}

interface PerformanceMetric {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

interface BusinessMetric {
  name: string;
  value: number;
  category: 'transaction' | 'user' | 'system';
  metadata?: Record<string, unknown>;
}

// ============================================
// Monitoring Class
// ============================================

class MonitoringService {
  private metrics: CustomMetric[] = [];
  private flushInterval: number | null = null;
  private isInitialized = false;

  /**
   * Initialize monitoring
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing monitoring service');

    // Setup periodic flush
    this.flushInterval = window.setInterval(
      () => this.flush(),
      MONITORING_CONFIG.metricsFlushInterval
    );

    // Setup performance observer
    this.setupPerformanceObserver();

    // Setup error boundary
    this.setupGlobalErrorHandler();

    this.isInitialized = true;
    logger.info('Monitoring service initialized');
  }

  /**
   * Cleanup monitoring
   */
  cleanup(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    this.flush();

    this.isInitialized = false;
    logger.info('Monitoring service cleaned up');
  }

  // ==========================================
  // Performance Monitoring
  // ==========================================

  /**
   * Track query performance
   */
  trackQuery(queryKey: string, duration: number, metadata?: Record<string, unknown>): void {
    this.recordMetric({
      name: 'query.duration',
      value: duration,
      unit: 'milliseconds',
      tags: {
        query: queryKey,
        slow: duration > MONITORING_CONFIG.slowQueryThreshold ? 'true' : 'false',
      },
    });

    // Send to Sentry for slow queries
    if (duration > MONITORING_CONFIG.slowQueryThreshold) {
      Sentry.addBreadcrumb({
        category: 'performance',
        message: `Slow query: ${queryKey}`,
        level: 'warning',
        data: { duration, ...metadata },
      });
    }
  }

  /**
   * Track component render performance
   */
  trackRender(componentName: string, duration: number): void {
    this.recordMetric({
      name: 'render.duration',
      value: duration,
      unit: 'milliseconds',
      tags: {
        component: componentName,
        slow: duration > MONITORING_CONFIG.slowRenderThreshold ? 'true' : 'false',
      },
    });

    if (duration > MONITORING_CONFIG.slowRenderThreshold) {
      logger.warn(`Slow render: ${componentName} (${duration}ms)`);
    }
  }

  /**
   * Track API call performance
   */
  trackAPICall(endpoint: string, duration: number, status: number): void {
    this.recordMetric({
      name: 'api.duration',
      value: duration,
      unit: 'milliseconds',
      tags: {
        endpoint,
        status: status.toString(),
        success: status >= 200 && status < 300 ? 'true' : 'false',
      },
    });
  }

  /**
   * Track navigation performance
   */
  trackNavigation(from: string, to: string, duration: number): void {
    this.recordMetric({
      name: 'navigation.duration',
      value: duration,
      unit: 'milliseconds',
      tags: { from, to },
    });
  }

  // ==========================================
  // Business Metrics
  // ==========================================

  /**
   * Track transaction created
   */
  trackTransactionCreated(type: 'income' | 'expense' | 'transfer', amount: number): void {
    this.recordMetric({
      name: 'transaction.created',
      value: 1,
      unit: 'count',
      tags: { type },
    });

    this.recordMetric({
      name: 'transaction.amount',
      value: amount,
      unit: 'count',
      tags: { type },
    });
  }

  /**
   * Track offline operations
   */
  trackOfflineOperation(operation: string): void {
    this.recordMetric({
      name: 'offline.operation',
      value: 1,
      unit: 'count',
      tags: { operation },
    });
  }

  /**
   * Track sync performance
   */
  trackSync(itemsCount: number, duration: number, success: boolean): void {
    this.recordMetric({
      name: 'sync.items',
      value: itemsCount,
      unit: 'count',
      tags: { success: success.toString() },
    });

    this.recordMetric({
      name: 'sync.duration',
      value: duration,
      unit: 'milliseconds',
      tags: { success: success.toString() },
    });
  }

  /**
   * Track cache hit/miss
   */
  trackCacheHit(hit: boolean, queryKey: string): void {
    this.recordMetric({
      name: 'cache.access',
      value: 1,
      unit: 'count',
      tags: {
        hit: hit.toString(),
        query: queryKey,
      },
    });
  }

  // ==========================================
  // Resource Monitoring
  // ==========================================

  /**
   * Track memory usage
   */
  trackMemoryUsage(): void {
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      
      this.recordMetric({
        name: 'memory.used',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
      });

      this.recordMetric({
        name: 'memory.limit',
        value: memory.jsHeapSizeLimit,
        unit: 'bytes',
      });

      const usage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      
      if (usage > 90) {
        logger.warn('High memory usage detected', { usage });
        Sentry.captureMessage('High memory usage', {
          level: 'warning',
          extra: { usage, used: memory.usedJSHeapSize },
        });
      }
    }
  }

  /**
   * Track IndexedDB usage
   */
  async trackIndexedDBUsage(): Promise<void> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = quota > 0 ? (usage / quota) * 100 : 0;

        this.recordMetric({
          name: 'indexeddb.usage',
          value: usage,
          unit: 'bytes',
        });

        this.recordMetric({
          name: 'indexeddb.quota',
          value: quota,
          unit: 'bytes',
        });

        if (percentage > 80) {
          logger.warn('IndexedDB quota almost full', { usage, quota, percentage });
        }
      } catch (error) {
        logger.error('Failed to estimate storage', error);
      }
    }
  }

  // ==========================================
  // Error Tracking
  // ==========================================

  /**
   * Track error with context
   */
  trackError(
    error: Error,
    context: {
      component?: string;
      action?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    logger.error('Error tracked', error, context);

    Sentry.captureException(error, {
      tags: {
        component: context.component,
        action: context.action,
      },
      extra: context.metadata,
      user: context.userId ? { id: context.userId } : undefined,
    });

    this.recordMetric({
      name: 'error.count',
      value: 1,
      unit: 'count',
      tags: {
        component: context.component || 'unknown',
        action: context.action || 'unknown',
      },
    });
  }

  /**
   * Track unhandled rejection
   */
  private setupGlobalErrorHandler(): void {
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Unhandled promise rejection', event.reason);
      
      Sentry.captureException(event.reason, {
        tags: { type: 'unhandled_rejection' },
      });
    });
  }

  // ==========================================
  // Performance Observer
  // ==========================================

  private setupPerformanceObserver(): void {
    if ('PerformanceObserver' in window) {
      try {
        // Long tasks
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > MONITORING_CONFIG.longTaskThreshold) {
              this.recordMetric({
                name: 'longtask.duration',
                value: entry.duration,
                unit: 'milliseconds',
              });
            }
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });

        // Navigation timing
        const navigationObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const navEntry = entry as PerformanceNavigationTiming;
            
            this.recordMetric({
              name: 'navigation.domContentLoaded',
              value: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
              unit: 'milliseconds',
            });

            this.recordMetric({
              name: 'navigation.loadComplete',
              value: navEntry.loadEventEnd - navEntry.loadEventStart,
              unit: 'milliseconds',
            });
          }
        });
        navigationObserver.observe({ entryTypes: ['navigation'] });

      } catch (error) {
        logger.warn('Performance observer not supported', error);
      }
    }
  }

  // ==========================================
  // Internal Methods
  // ==========================================

  private recordMetric(metric: CustomMetric): void {
    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp || Date.now(),
    });

    // Auto-flush if batch is full
    if (this.metrics.length >= MONITORING_CONFIG.maxBatchSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.metrics.length === 0) {
      return;
    }

    logger.debug(`Flushing ${this.metrics.length} metrics`);

    // Send to Sentry
    this.metrics.forEach((metric) => {
      Sentry.metrics.distribution(metric.name, metric.value, {
        tags: metric.tags,
        unit: metric.unit,
      });
    });

    // Clear buffer
    this.metrics = [];
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Get current stats
   */
  getStats(): {
    pendingMetrics: number;
    isInitialized: boolean;
  } {
    return {
      pendingMetrics: this.metrics.length,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Force flush
   */
  forceFlush(): void {
    this.flush();
  }
}

// ==========================================
// Export Singleton
// ==========================================

export const monitoring = new MonitoringService();

// ==========================================
// Helper Functions
// ==========================================

/**
 * Decorator for tracking function performance
 */
export function trackPerformance(name: string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const start = performance.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        monitoring.trackQuery(name, duration);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        monitoring.trackError(error as Error, {
          action: name,
          metadata: { duration },
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Hook for tracking component lifecycle
 */
export function useMonitoring(componentName: string): void {
  const renderStart = performance.now();

  // Track render time
  const renderDuration = performance.now() - renderStart;
  if (renderDuration > 0) {
    monitoring.trackRender(componentName, renderDuration);
  }
}

// ==========================================
// Auto-initialize in production
// ==========================================

if (import.meta.env.PROD) {
  monitoring.initialize();
  
  // Track memory periodically
  setInterval(() => {
    monitoring.trackMemoryUsage();
    monitoring.trackIndexedDBUsage();
  }, 60000); // Every minute
}
