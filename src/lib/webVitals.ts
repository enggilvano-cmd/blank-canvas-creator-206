import { onCLS, onFCP, onINP, onLCP, onTTFB, Metric } from 'web-vitals';
import { captureMessage } from './sentry';
import { logger } from './logger';
import { safeStorage } from './safeStorage';

/**
 * Web Vitals monitoring
 * Tracks Core Web Vitals and reports them to Sentry and console
 */

interface VitalThresholds {
  good: number;
  needsImprovement: number;
}

const VITALS_THRESHOLDS: Record<string, VitalThresholds> = {
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  INP: { good: 200, needsImprovement: 500 },
  LCP: { good: 2500, needsImprovement: 4000 },
  TTFB: { good: 800, needsImprovement: 1800 },
};

function getRating(metric: Metric): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = VITALS_THRESHOLDS[metric.name];
  if (!thresholds) return 'good';

  if (metric.value <= thresholds.good) return 'good';
  if (metric.value <= thresholds.needsImprovement) return 'needs-improvement';
  return 'poor';
}

function handleVital(metric: Metric): void {
  const rating = getRating(metric);
  
  // Log to console in development
  if (import.meta.env.DEV) {
    logger.info(`Web Vital: ${metric.name}`, {
      value: metric.value,
      rating,
      delta: metric.delta,
      id: metric.id,
    });
  }

  // Report poor vitals to Sentry
  if (rating === 'poor') {
    captureMessage(`Poor Web Vital: ${metric.name}`, 'warning', {
      metric: metric.name,
      value: metric.value,
      rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
    });
  }

  // Store in safeStorage for analytics
  const vitalsKey = 'web-vitals-history';
  const history = safeStorage.getJSON<Array<{
    name: string;
    value: number;
    rating: string;
    timestamp: number;
    path: string;
  }>>(vitalsKey) || [];
  
  history.push({
    name: metric.name,
    value: metric.value,
    rating,
    timestamp: Date.now(),
    path: window.location.pathname,
  });

  // Keep only last 50 entries
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }

  safeStorage.setJSON(vitalsKey, history);
}

/**
 * Initialize Web Vitals monitoring
 * Call this once when the app starts
 */
export function initWebVitals(): void {
  try {
    // Cumulative Layout Shift
    onCLS(handleVital);
    
    // First Contentful Paint
    onFCP(handleVital);
    
    // Interaction to Next Paint (replaces deprecated FID)
    onINP(handleVital);
    
    // Largest Contentful Paint
    onLCP(handleVital);
    
    // Time to First Byte
    onTTFB(handleVital);

    logger.info('Web Vitals monitoring initialized');
  } catch (error) {
    logger.error('Failed to initialize Web Vitals:', error);
  }
}

/**
 * Get Web Vitals history from storage
 */
export function getWebVitalsHistory(): Array<{
  name: string;
  value: number;
  rating: string;
  timestamp: number;
  path: string;
}> {
  return safeStorage.getJSON<Array<{
    name: string;
    value: number;
    rating: string;
    timestamp: number;
    path: string;
  }>>('web-vitals-history') || [];
}

/**
 * Clear Web Vitals history
 */
export function clearWebVitalsHistory(): void {
  safeStorage.removeItem('web-vitals-history');
  logger.info('Web Vitals history cleared');
}
