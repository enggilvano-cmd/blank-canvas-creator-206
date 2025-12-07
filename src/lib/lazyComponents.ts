/**
 * Lazy loading for heavy components
 * Reduces initial bundle size by splitting components into separate chunks
 */

import { lazy } from 'react';
import { logger } from './logger';

// Heavy data visualization components
export const AnalyticsPage = lazy(() => 
  import('@/components/AnalyticsPage')
);

// Complex transaction components  
export const FixedTransactionsPage = lazy(() => 
  import('@/components/FixedTransactionsPage').then(module => ({ default: module.FixedTransactionsPage }))
);

export const TransactionsPage = lazy(() => 
  import('@/components/TransactionsPage').then(module => ({ default: module.TransactionsPage }))
);

// Import/Export modals - only loaded when needed
export const ImportTransactionsModal = lazy(() => 
  import('@/components/ImportTransactionsModal').then(module => ({ default: module.ImportTransactionsModal }))
);

export const ImportAccountsModal = lazy(() => 
  import('@/components/ImportAccountsModal').then(module => ({ default: module.ImportAccountsModal }))
);

export const ImportCategoriesModal = lazy(() => 
  import('@/components/ImportCategoriesModal').then(module => ({ default: module.ImportCategoriesModal }))
);

export const ImportFixedTransactionsModal = lazy(() => 
  import('@/components/ImportFixedTransactionsModal').then(module => ({ default: module.ImportFixedTransactionsModal }))
);

// Settings and configuration pages
export const SettingsPage = lazy(() => 
  import('@/components/SettingsPage').then(module => ({ default: module.SettingsPage }))
);

export const SystemSettings = lazy(() => 
  import('@/components/SystemSettings')
);

export const DatabasePerformanceTest = lazy(() => 
  import('@/components/DatabasePerformanceTest').then(module => ({ default: module.DatabasePerformanceTest }))
);

// PWA and debugging components
export const PWACompatibilityTest = lazy(() => 
  import('@/components/PWACompatibilityTest').then(module => ({ default: module.PWACompatibilityTest }))
);

export const PWADebug = lazy(() => 
  import('@/components/PWADebug').then(module => ({ default: module.PWADebug }))
);

// User management components
export const UserManagement = lazy(() => 
  import('@/components/UserManagement').then(module => ({ default: module.UserManagement }))
);

export const TwoFactorSetup = lazy(() => 
  import('@/components/TwoFactorSetup').then(module => ({ default: module.TwoFactorSetup }))
);

// Bundle size tracking
export const getBundleStats = () => ({
  totalLazyComponents: 13,
  estimatedSavings: '~800KB',
  loadedComponents: new Set(),
  markLoaded: (componentName: string) => {
    // ✅ BUG FIX #9: Usar logger ao invés de console.log
    logger.debug(`Lazy component loaded: ${componentName}`);
  }
});