/**
 * Lazy loading utilities for heavy libraries
 * Reduces initial bundle size by ~2MB
 */

import { logger } from './logger';

let xlsxModule: typeof import('xlsx') | null = null;
let jsPDFModule: typeof import('jspdf') | null = null;
let htmlToImageModule: typeof import('html-to-image') | null = null;
let rechartModule: typeof import('recharts') | null = null;
let dateFnsModule: typeof import('date-fns') | null = null;
let lucideModule: typeof import('lucide-react') | null = null;

/**
 * Lazy load XLSX library (~800KB)
 * Used for Excel import/export functionality
 */
export async function loadXLSX() {
  if (!xlsxModule) {
    xlsxModule = await import('xlsx');
  }
  return xlsxModule;
}

/**
 * Lazy load jsPDF library (~600KB)
 * Used for PDF generation
 */
export async function loadJsPDF() {
  if (!jsPDFModule) {
    jsPDFModule = await import('jspdf');
  }
  return jsPDFModule;
}

/**
 * Lazy load html-to-image library (~200KB)
 * Used for converting HTML elements to images
 */
export async function loadHtmlToImage() {
  if (!htmlToImageModule) {
    htmlToImageModule = await import('html-to-image');
  }
  return htmlToImageModule;
}

/**
 * Lazy load Recharts library (~400KB)
 * Used for data visualization
 */
export async function loadRecharts() {
  if (!rechartModule) {
    rechartModule = await import('recharts');
  }
  return rechartModule;
}

/**
 * Lazy load date-fns library (~300KB)
 * Used for advanced date manipulation
 */
export async function loadDateFns() {
  if (!dateFnsModule) {
    dateFnsModule = await import('date-fns');
  }
  return dateFnsModule;
}

/**
 * Lazy load specific Lucide icons (~50KB per icon set)
 * Load icon bundles dynamically
 */
export async function loadLucideIcons(iconNames: string[]) {
  if (!lucideModule) {
    lucideModule = await import('lucide-react');
  }
  
  const icons: Record<string, any> = {};
  for (const iconName of iconNames) {
    if (lucideModule[iconName as keyof typeof lucideModule]) {
      icons[iconName] = lucideModule[iconName as keyof typeof lucideModule];
    }
  }
  
  return icons;
}

/**
 * Preload critical libraries during idle time
 */
export function preloadCriticalLibraries(): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(async () => {
      // Preload commonly used libraries
      try {
        await Promise.all([
          loadDateFns(),
          loadLucideIcons(['Calendar', 'DollarSign', 'TrendingUp', 'Settings'])
        ]);
        logger.debug('Critical libraries preloaded during idle time');
      } catch (error) {
        logger.warn('Failed to preload libraries:', error);
      }
    });
  }
}

/**
 * Bundle analysis helper
 */
export function getBundleInfo(): Record<string, string> {
  return {
    xlsx: xlsxModule ? 'loaded' : 'not-loaded',
    jsPDF: jsPDFModule ? 'loaded' : 'not-loaded', 
    htmlToImage: htmlToImageModule ? 'loaded' : 'not-loaded',
    recharts: rechartModule ? 'loaded' : 'not-loaded',
    dateFns: dateFnsModule ? 'loaded' : 'not-loaded',
    lucide: lucideModule ? 'loaded' : 'not-loaded',
  };
}
