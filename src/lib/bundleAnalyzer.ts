/**
 * Bundle Analysis & Optimization Tracking
 * Monitors bundle size, lazy loading efficiency, and performance
 */

import { logger } from './logger';

interface BundleMetrics {
  initialBundle: number;
  lazyChunks: number;
  totalModules: number;
  loadedModules: number;
  cacheHitRatio: number;
  performanceScore: number;
}

class BundleAnalyzer {
  private metrics: BundleMetrics = {
    initialBundle: 0,
    lazyChunks: 0,
    totalModules: 0,
    loadedModules: 0,
    cacheHitRatio: 0,
    performanceScore: 100
  };

  private loadedComponents = new Set<string>();
  private componentLoadTimes = new Map<string, number>();

  /**
   * Initialize bundle analysis
   */
  init(): void {
    if (typeof window === 'undefined') return;

    // Monitor Performance API
    if (typeof window !== 'undefined' && window.performance && 
        typeof window.performance.getEntriesByType === 'function') {
      this.analyzeNetworkRequests();
      this.monitorResourceLoading();
    }

    // Track initial bundle size
    this.trackInitialBundle();
    
    // Start monitoring
    this.startContinuousMonitoring();

    logger.debug('Bundle analyzer initialized');
  }

  /**
   * Track component lazy loading
   */
  trackComponentLoad(componentName: string): void {
    const startTime = performance.now();
    
    this.loadedComponents.add(componentName);
    this.componentLoadTimes.set(componentName, startTime);
    this.metrics.loadedModules++;

    logger.debug(`Component loaded: ${componentName} (${this.loadedComponents.size}/${this.metrics.totalModules})`);
  }

  /**
   * Analyze network requests for bundle insights
   */
  private analyzeNetworkRequests(): void {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    let jsSize = 0;
    let cssSize = 0;
    let chunkCount = 0;
    
    resources.forEach((resource) => {
      if (resource.name.includes('.js')) {
        jsSize += resource.transferSize || resource.encodedBodySize || 0;
        if (resource.name.includes('chunk')) {
          chunkCount++;
        }
      } else if (resource.name.includes('.css')) {
        cssSize += resource.transferSize || resource.encodedBodySize || 0;
      }
    });

    this.metrics.initialBundle = jsSize;
    this.metrics.lazyChunks = chunkCount;

    logger.debug('Bundle Analysis:', {
      'JS Size': `${(jsSize / 1024).toFixed(1)}KB`,
      'CSS Size': `${(cssSize / 1024).toFixed(1)}KB`,
      'Lazy Chunks': chunkCount,
      'Total': `${((jsSize + cssSize) / 1024).toFixed(1)}KB`
    });
  }

  /**
   * Monitor resource loading performance
   */
  private monitorResourceLoading(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'resource') {
          const resource = entry as PerformanceResourceTiming;
          
          if (resource.name.includes('chunk') || resource.name.includes('lazy')) {
            const loadTime = resource.responseEnd - resource.startTime;
            console.log(`⚡ Lazy chunk loaded: ${resource.name.split('/').pop()} in ${loadTime.toFixed(1)}ms`);
          }
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  /**
   * Track initial bundle size from build manifest
   */
  private trackInitialBundle(): void {
    // Estimate total modules based on dynamic imports
    this.metrics.totalModules = 15; // Heavy components identified
    
    // Check for Vite build info
    if (typeof window !== 'undefined' && (window as any).__VITE_IS_MODERN__) {
      console.log('🔧 Modern build detected - optimized bundle');
    }
  }

  /**
   * Start continuous monitoring
   */
  private startContinuousMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(() => {
      this.updatePerformanceScore();
      
      if (this.metrics.loadedModules > 0) {
        console.log('📈 Bundle Status:', {
          'Loaded Modules': `${this.metrics.loadedModules}/${this.metrics.totalModules}`,
          'Performance Score': `${this.metrics.performanceScore.toFixed(1)}%`,
          'Memory': this.getMemoryUsage()
        });
      }
    }, 30000);
  }

  /**
   * Update performance score based on loading efficiency
   */
  private updatePerformanceScore(): void {
    const loadingRatio = this.metrics.loadedModules / this.metrics.totalModules;
    const memoryUsage = this.getMemoryUsage();
    
    // Calculate score based on:
    // - Lazy loading efficiency (40%)
    // - Memory usage (30%) 
    // - Bundle size optimization (30%)
    const lazyScore = (1 - loadingRatio) * 40; // Less loaded = better
    const memoryScore = (memoryUsage < 50 ? 30 : Math.max(0, 30 - (memoryUsage - 50)));
    const bundleScore = this.metrics.lazyChunks > 5 ? 30 : 20; // More chunks = better splitting

    this.metrics.performanceScore = lazyScore + memoryScore + bundleScore;
  }

  /**
   * Get memory usage estimate
   */
  private getMemoryUsage(): number {
    if (typeof window !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
    }
    return 0;
  }

  /**
   * Generate optimization report
   */
  getOptimizationReport(): {
    bundleHealth: 'excellent' | 'good' | 'needs-improvement';
    recommendations: string[];
    metrics: BundleMetrics;
    savings: string;
  } {
    const score = this.metrics.performanceScore;
    let bundleHealth: 'excellent' | 'good' | 'needs-improvement';
    let recommendations: string[] = [];

    if (score >= 80) {
      bundleHealth = 'excellent';
      recommendations.push('✅ Bundle is well optimized!');
    } else if (score >= 60) {
      bundleHealth = 'good';
      recommendations.push('⚡ Consider lazy loading more components');
    } else {
      bundleHealth = 'needs-improvement';
      recommendations.push('🚨 Bundle size needs optimization');
      recommendations.push('💡 Enable more aggressive code splitting');
      recommendations.push('🗑️ Remove unused imports and dependencies');
    }

    // Calculate estimated savings
    const estimatedSavings = `~${(this.metrics.lazyChunks * 50).toFixed(0)}KB`;

    return {
      bundleHealth,
      recommendations,
      metrics: this.metrics,
      savings: estimatedSavings
    };
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(): BundleMetrics & {
    loadedComponents: string[];
    componentLoadTimes: Record<string, number>;
  } {
    return {
      ...this.metrics,
      loadedComponents: Array.from(this.loadedComponents),
      componentLoadTimes: Object.fromEntries(this.componentLoadTimes)
    };
  }
}

// Global bundle analyzer instance
export const bundleAnalyzer = new BundleAnalyzer();

// Initialize on load
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bundleAnalyzer.init());
  } else {
    bundleAnalyzer.init();
  }
}