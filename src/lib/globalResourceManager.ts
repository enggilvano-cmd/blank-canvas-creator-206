import { logger } from './logger';

/**
 * Global Resource Manager
 * Centralizes cleanup of all global resources (timers, intervals, subscriptions)
 * to prevent memory leaks on logout or app cleanup
 */

type ResourceType = 'interval' | 'timeout' | 'subscription' | 'listener';

type IntervalResource = ReturnType<typeof setInterval>;
type TimeoutResource = ReturnType<typeof setTimeout>;
type SubscriptionResource = { unsubscribe: () => void } | { remove: () => void };
type ListenerResource = { target: EventTarget; event: string; handler: EventListenerOrEventListenerObject };

type ResourceData = IntervalResource | TimeoutResource | SubscriptionResource | ListenerResource;

interface ManagedResource {
  id: string;
  type: ResourceType;
  resource: ResourceData;
  description: string;
  createdAt: number;
}

class GlobalResourceManager {
  private resources = new Map<string, ManagedResource>();
  private nextId = 0;

  /**
   * Register an interval for cleanup
   */
  registerInterval(interval: ReturnType<typeof setInterval>, description: string): string {
    const id = this.generateId('interval');
    this.resources.set(id, {
      id,
      type: 'interval',
      resource: interval,
      description,
      createdAt: Date.now(),
    });
    logger.debug(`Registered interval: ${description} (${id})`);
    return id;
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeout: ReturnType<typeof setTimeout>, description: string): string {
    const id = this.generateId('timeout');
    this.resources.set(id, {
      id,
      type: 'timeout',
      resource: timeout,
      description,
      createdAt: Date.now(),
    });
    logger.debug(`Registered timeout: ${description} (${id})`);
    return id;
  }

  /**
   * Register a subscription for cleanup (e.g., Supabase channel)
   */
  registerSubscription(
    subscription: { unsubscribe: () => void } | { remove: () => void },
    description: string
  ): string {
    const id = this.generateId('subscription');
    this.resources.set(id, {
      id,
      type: 'subscription',
      resource: subscription,
      description,
      createdAt: Date.now(),
    });
    logger.debug(`Registered subscription: ${description} (${id})`);
    return id;
  }

  /**
   * Register an event listener for cleanup
   */
  registerListener(
    target: EventTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    description: string
  ): string {
    const id = this.generateId('listener');
    this.resources.set(id, {
      id,
      type: 'listener',
      resource: { target, event, handler },
      description,
      createdAt: Date.now(),
    });
    logger.debug(`Registered listener: ${description} (${id})`);
    return id;
  }

  /**
   * Unregister a specific resource by ID
   */
  unregister(id: string): void {
    const resource = this.resources.get(id);
    if (!resource) {
      logger.warn(`Resource not found: ${id}`);
      return;
    }

    this.cleanupResource(resource);
    this.resources.delete(id);
  }

  /**
   * Clean up a single resource
   */
  private cleanupResource(resource: ManagedResource): void {
    try {
      switch (resource.type) {
        case 'interval': {
          clearInterval(resource.resource as IntervalResource);
          logger.debug(`Cleared interval: ${resource.description}`);
          break;
        }
        case 'timeout': {
          clearTimeout(resource.resource as TimeoutResource);
          logger.debug(`Cleared timeout: ${resource.description}`);
          break;
        }
        case 'subscription': {
          const sub = resource.resource as SubscriptionResource;
          if ('unsubscribe' in sub) {
            sub.unsubscribe();
          } else if ('remove' in sub) {
            sub.remove();
          }
          logger.debug(`Unsubscribed: ${resource.description}`);
          break;
        }
        case 'listener': {
          const { target, event, handler } = resource.resource as ListenerResource;
          target.removeEventListener(event, handler);
          logger.debug(`Removed listener: ${resource.description}`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up resource ${resource.description}:`, error);
    }
  }

  /**
   * Clean up all registered resources
   */
  cleanupAll(): void {
    logger.info(`Cleaning up ${this.resources.size} global resources...`);
    
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    this.resources.forEach((resource) => {
      try {
        this.cleanupResource(resource);
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`Failed to cleanup ${resource.description}:`, error);
      }
    });

    this.resources.clear();
    
    const duration = Date.now() - startTime;
    logger.info(
      `Cleanup complete: ${successCount} success, ${errorCount} errors in ${duration}ms`
    );
  }

  /**
   * Clean up resources by type
   */
  cleanupByType(type: ResourceType): void {
    const toCleanup = Array.from(this.resources.values()).filter((r) => r.type === type);
    logger.info(`Cleaning up ${toCleanup.length} resources of type ${type}...`);

    toCleanup.forEach((resource) => {
      this.cleanupResource(resource);
      this.resources.delete(resource.id);
    });
  }

  /**
   * Get resource statistics for debugging
   */
  getStats(): {
    total: number;
    byType: Record<ResourceType, number>;
    oldestResource: ManagedResource | null;
  } {
    const byType: Record<ResourceType, number> = {
      interval: 0,
      timeout: 0,
      subscription: 0,
      listener: 0,
    };

    let oldest: ManagedResource | null = null;

    this.resources.forEach((resource) => {
      byType[resource.type]++;
      if (!oldest || resource.createdAt < oldest.createdAt) {
        oldest = resource;
      }
    });

    return {
      total: this.resources.size,
      byType,
      oldestResource: oldest,
    };
  }

  /**
   * List all registered resources (for debugging)
   */
  listResources(): ManagedResource[] {
    return Array.from(this.resources.values());
  }

  private generateId(type: ResourceType): string {
    this.nextId++;
    return `${type}-${this.nextId}-${Date.now()}`;
  }
}

// Singleton instance
export const globalResourceManager = new GlobalResourceManager();

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalResourceManager.cleanupAll();
  });
}

/**
 * Hook helper for automatic cleanup on component unmount
 */
export function useGlobalResourceCleanup(cleanupFn: () => void, deps: unknown[] = []) {
  // This is imported in components that use React
  const { useEffect } = require('react');
  useEffect(() => {
    return () => {
      cleanupFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
