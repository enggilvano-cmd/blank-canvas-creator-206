/**
 * Tree Shaking Utilities
 * Removes unused code and optimizes imports for minimal bundle size
 */

import { logger } from './logger';

// Track imported but unused modules
const importTracker = new Map<string, {
  imported: boolean;
  used: boolean;
  size: number;
  lastUsed?: number;
}>();

/**
 * Register module import
 */
export function trackImport(moduleName: string, estimatedSize: number): void {
  importTracker.set(moduleName, {
    imported: true,
    used: false,
    size: estimatedSize,
  });
  
  logger.debug(`📦 Import tracked: ${moduleName} (~${estimatedSize}KB)`);
}

/**
 * Mark module as used
 */
export function markModuleUsed(moduleName: string): void {
  const module = importTracker.get(moduleName);
  if (module) {
    module.used = true;
    module.lastUsed = Date.now();
    logger.debug(`✅ Module used: ${moduleName}`);
  }
}

/**
 * Get unused imports report
 */
export function getUnusedImports(): {
  modules: string[];
  totalWastedSize: number;
  recommendations: string[];
} {
  const unusedModules: string[] = [];
  let totalWastedSize = 0;

  for (const [moduleName, info] of importTracker.entries()) {
    if (info.imported && !info.used) {
      unusedModules.push(moduleName);
      totalWastedSize += info.size;
    }
  }

  const recommendations: string[] = [];
  if (unusedModules.length > 0) {
    recommendations.push(`🗑️ Remove ${unusedModules.length} unused imports`);
    recommendations.push(`💾 Save ~${totalWastedSize}KB bundle size`);
    
    unusedModules.forEach(module => {
      recommendations.push(`  - Remove import of '${module}'`);
    });
  }

  return {
    modules: unusedModules,
    totalWastedSize,
    recommendations
  };
}

/**
 * Optimize import statement for tree shaking
 * Converts default imports to named imports when possible
 */
export function optimizeImport(
  importStatement: string,
  usedExports: string[]
): string {
  // Convert lodash imports to specific functions
  if (importStatement.includes('lodash')) {
    const specific = usedExports.map(exp => `import { ${exp} } from 'lodash/${exp.toLowerCase()}';`).join('\n');
    return specific;
  }

  // Convert material-ui imports to specific components
  if (importStatement.includes('@mui/material')) {
    const specific = usedExports.map(exp => `import ${exp} from '@mui/material/${exp}';`).join('\n');
    return specific;
  }

  // Convert react-icons to specific icon packs
  if (importStatement.includes('react-icons')) {
    const iconPacks = new Map<string, string[]>();
    
    usedExports.forEach(icon => {
      const pack = icon.substring(0, 2).toLowerCase(); // Fa, Md, etc.
      if (!iconPacks.has(pack)) {
        iconPacks.set(pack, []);
      }
      iconPacks.get(pack)!.push(icon);
    });

    return Array.from(iconPacks.entries())
      .map(([pack, icons]) => `import { ${icons.join(', ')} } from 'react-icons/${pack}';`)
      .join('\n');
  }

  return importStatement;
}

/**
 * Dynamic import wrapper with usage tracking
 */
export async function trackedDynamicImport<T>(
  moduleName: string,
  importPath: string,
  estimatedSize: number = 50
): Promise<T> {
  trackImport(moduleName, estimatedSize);
  
  const startTime = performance.now();
  
  try {
    const module = await import(importPath);
    const loadTime = performance.now() - startTime;
    
    markModuleUsed(moduleName);
    logger.debug(`⚡ Dynamic import loaded: ${moduleName} in ${loadTime.toFixed(1)}ms`);
    
    return module;
  } catch (error) {
    logger.error(`❌ Failed to load module: ${moduleName}`, error);
    throw error;
  }
}

/**
 * Batch import optimization
 * Groups related imports to reduce HTTP requests
 */
export class ImportBatcher {
  private batches = new Map<string, {
    modules: string[];
    priority: 'high' | 'medium' | 'low';
    loaded: boolean;
  }>();

  /**
   * Add module to batch
   */
  addToBatch(
    batchName: string, 
    moduleName: string, 
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): void {
    if (!this.batches.has(batchName)) {
      this.batches.set(batchName, {
        modules: [],
        priority,
        loaded: false
      });
    }

    this.batches.get(batchName)!.modules.push(moduleName);
  }

  /**
   * Load batch of modules
   */
  async loadBatch(batchName: string): Promise<any[]> {
    const batch = this.batches.get(batchName);
    if (!batch || batch.loaded) {
      return [];
    }

    logger.debug(`📦 Loading batch: ${batchName} (${batch.modules.length} modules)`);

    try {
      const promises = batch.modules.map(async (moduleName) => {
        return trackedDynamicImport(moduleName, moduleName);
      });

      const results = await Promise.all(promises);
      batch.loaded = true;

      logger.debug(`✅ Batch loaded: ${batchName}`);
      return results;
    } catch (error) {
      logger.error(`❌ Batch load failed: ${batchName}`, error);
      throw error;
    }
  }

  /**
   * Preload high priority batches
   */
  preloadHighPriority(): void {
    const highPriorityBatches = Array.from(this.batches.entries())
      .filter(([, batch]) => batch.priority === 'high' && !batch.loaded);

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(async () => {
        for (const [batchName] of highPriorityBatches) {
          try {
            await this.loadBatch(batchName);
          } catch (error) {
            logger.warn(`Failed to preload batch: ${batchName}`, error);
          }
        }
      });
    }
  }

  /**
   * Get optimization report
   */
  getReport(): {
    totalBatches: number;
    loadedBatches: number;
    pendingModules: number;
    recommendations: string[];
  } {
    const totalBatches = this.batches.size;
    const loadedBatches = Array.from(this.batches.values()).filter(b => b.loaded).length;
    const pendingModules = Array.from(this.batches.values())
      .filter(b => !b.loaded)
      .reduce((sum, b) => sum + b.modules.length, 0);

    const recommendations: string[] = [];
    if (pendingModules > 10) {
      recommendations.push('⚡ Consider loading more batches proactively');
    }
    if (loadedBatches / totalBatches < 0.5) {
      recommendations.push('📦 Optimize batch loading strategy');
    }

    return {
      totalBatches,
      loadedBatches,
      pendingModules,
      recommendations
    };
  }
}

// Global import batcher
export const importBatcher = new ImportBatcher();

// Configure common batches
importBatcher.addToBatch('ui-components', '@/components/ui/button', 'high');
importBatcher.addToBatch('ui-components', '@/components/ui/dialog', 'high');
importBatcher.addToBatch('ui-components', '@/components/ui/input', 'high');

importBatcher.addToBatch('analytics', '@/components/AnalyticsPage', 'medium');
importBatcher.addToBatch('analytics', 'recharts', 'medium');
importBatcher.addToBatch('analytics', 'date-fns', 'medium');

importBatcher.addToBatch('import-export', 'xlsx', 'low');
importBatcher.addToBatch('import-export', 'jspdf', 'low');
importBatcher.addToBatch('import-export', 'html-to-image', 'low');

// Auto-preload high priority batches
if (typeof window !== 'undefined') {
  importBatcher.preloadHighPriority();
}

/**
 * Generate tree shaking report
 */
export function generateTreeShakingReport(): {
  unusedImports: ReturnType<typeof getUnusedImports>;
  batchReport: ReturnType<typeof importBatcher.getReport>;
  totalOptimizationPotential: string;
  recommendations: string[];
} {
  const unusedImports = getUnusedImports();
  const batchReport = importBatcher.getReport();
  
  const totalSavings = unusedImports.totalWastedSize + (batchReport.pendingModules * 30);
  const totalOptimizationPotential = `~${totalSavings}KB`;

  const recommendations = [
    ...unusedImports.recommendations,
    ...batchReport.recommendations,
    '🌲 Enable aggressive tree shaking in build config',
    '📊 Monitor bundle analyzer for optimization opportunities'
  ];

  return {
    unusedImports,
    batchReport,
    totalOptimizationPotential,
    recommendations
  };
}