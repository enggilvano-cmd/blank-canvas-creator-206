/**
 * ✅ PRIORITY 3: Bundle Size Optimization Guide
 * 
 * Estratégias para reduzir o tamanho do bundle e melhorar performance
 */

// ============================================
// 1. LAZY LOADING DE ROTAS
// ============================================

import React, { lazy } from 'react';

// ❌ ANTES: Import estático (todos os componentes no bundle inicial)
// import Dashboard from './pages/Dashboard';
// import Transactions from './pages/Transactions';

// ✅ DEPOIS: Lazy loading (code splitting automático)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Analytics = lazy(() => import('./pages/AnalyticsPage'));
const Accounts = lazy(() => import('./pages/AccountsPage'));
const Categories = lazy(() => import('./pages/CategoriesPage'));
const Settings = lazy(() => import('./pages/SettingsPage'));

// Para usar com Suspense wrapper - ver App.tsx para implementação JSX
export type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

// ============================================
// 2. DYNAMIC IMPORTS PARA BIBLIOTECAS PESADAS
// ============================================

// ❌ ANTES: Import direto de biblioteca pesada
// import * as XLSX from 'xlsx';
// import jsPDF from 'jspdf';

// ✅ DEPOIS: Import dinâmico apenas quando necessário
export async function exportToExcel(data: unknown[]): Promise<void> {
  const XLSX = await import('xlsx');
  // Use XLSX...
}

export async function exportToPDF(data: unknown[]): Promise<void> {
  const jsPDF = await import('jspdf');
  // Use jsPDF...
}

// ============================================
// 3. TREE SHAKING DE ÍCONES
// ============================================

// ❌ ANTES: Import de todos os ícones
// import * as Icons from 'lucide-react';

// ✅ DEPOIS: Import específico (permite tree shaking)
import { Plus, Edit, Trash, Download, Upload } from 'lucide-react';

// ============================================
// 4. LODASH MODULAR
// ============================================

// ❌ ANTES: Import de lodash completo (70kb)
// import _ from 'lodash';
// _.debounce(fn, 300);

// ✅ DEPOIS: Import específico (5kb)
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import groupBy from 'lodash/groupBy';

// ============================================
// 5. DATE LIBRARIES
// ============================================

// ❌ ANTES: moment.js (muito pesado - 67kb)
// import moment from 'moment';

// ✅ DEPOIS: date-fns (apenas funções necessárias)
import { format, parseISO, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================
// 6. CHART LIBRARIES
// ============================================

// Para Recharts, importar apenas componentes necessários
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Evitar importar tudo:
// import * as Recharts from 'recharts'; // ❌

// ============================================
// 7. WEBPACK MAGIC COMMENTS
// ============================================

// Prefetch (load durante idle time)
const AdminPanel = lazy(() => 
  import(/* webpackPrefetch: true */ './pages/AdminPanel')
);

// Preload (load imediatamente)
const CriticalComponent = lazy(() => 
  import(/* webpackPreload: true */ './components/CriticalComponent')
);

// Chunk naming
const ReportsPage = lazy(() => 
  import(/* webpackChunkName: "reports" */ './pages/ReportsPage')
);

// ============================================
// 8. POLYFILLS CONDICIONAIS
// ============================================

// Carregar polyfills apenas se necessário
async function loadPolyfills(): Promise<void> {
  const needsPolyfills = !('IntersectionObserver' in window);
  
  if (needsPolyfills) {
    await import('intersection-observer');
  }
}

// ============================================
// 9. CSS-IN-JS OPTIMIZATION
// ============================================

// Use CSS modules ou Tailwind ao invés de bibliotecas CSS-in-JS pesadas
// Evitar: styled-components, emotion em componentes pequenos

// ✅ Prefira:
// - Tailwind CSS (utility-first, tree-shakeable)
// - CSS Modules (zero runtime)

// ============================================
// 10. VENDOR SPLITTING
// ============================================

// Configurar no vite.config.ts:
export const rollupOptions = {
  output: {
    manualChunks: {
      // React core
      'react-vendor': ['react', 'react-dom', 'react-router-dom'],
      
      // React Query
      'query-vendor': ['@tanstack/react-query'],
      
      // UI components
      'ui-vendor': [
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-select',
      ],
      
      // Supabase
      'supabase-vendor': ['@supabase/supabase-js'],
      
      // Charts (pesado, chunk separado)
      'chart-vendor': ['recharts'],
      
      // Excel export (muito pesado, chunk separado)
      'excel-vendor': ['xlsx'],
    },
  },
};

// ============================================
// 11. COMPRESSION
// ============================================

// Habilitar compressão no build (vite.config.ts)
import viteCompression from 'vite-plugin-compression';

export const compressionPlugin = viteCompression({
  verbose: true,
  disable: false,
  threshold: 10240, // 10kb
  algorithm: 'gzip',
  ext: '.gz',
});

// ============================================
// 12. REMOVE DEVELOPMENT CODE
// ============================================

// Usar variáveis de ambiente para remover código de dev
if (import.meta.env.DEV) {
  // Código apenas para desenvolvimento
  // Será removido no build de produção
}

// ============================================
// 13. ANALYZE BUNDLE
// ============================================

// Adicionar ao package.json:
// "scripts": {
//   "analyze": "vite-bundle-visualizer"
// }

// Executar: npm run analyze
// Identifica chunks grandes e oportunidades de otimização

// ============================================
// 14. PRECONNECT & DNS-PREFETCH
// ============================================

// Adicionar no index.html:
// <link rel="preconnect" href="https://fonts.googleapis.com">
// <link rel="dns-prefetch" href="https://api.supabase.co">

// ============================================
// 15. SERVICE WORKER CACHING
// ============================================

// Configurado via vite-plugin-pwa
// Cache de assets estáticos e API responses

// ============================================
// CHECKLIST DE OTIMIZAÇÃO
// ============================================

/**
 * Bundle Size Optimization Checklist:
 * 
 * [ ] Lazy loading de rotas implementado
 * [ ] Dynamic imports para bibliotecas pesadas
 * [ ] Tree shaking habilitado (imports específicos)
 * [ ] Vendor splitting configurado
 * [ ] Compressão gzip/brotli habilitada
 * [ ] CSS otimizado (Tailwind purge)
 * [ ] Imagens otimizadas (WebP, lazy loading)
 * [ ] Service Worker caching
 * [ ] Bundle analyzer executado
 * [ ] Lighthouse score > 90
 * 
 * Target Sizes:
 * - Initial bundle: < 200kb (gzipped)
 * - Total size: < 1MB (gzipped)
 * - Largest chunk: < 500kb (gzipped)
 * - FCP (First Contentful Paint): < 1.8s
 * - TTI (Time to Interactive): < 3.8s
 */

// ============================================
// EXPORTS
// ============================================

export {
  Dashboard,
  Transactions,
  Analytics,
  Accounts,
  Categories,
  Settings,
  LazyRoute,
  exportToExcel,
  exportToPDF,
  Plus,
  Edit,
  Trash,
  Download,
  Upload,
  debounce,
  throttle,
  groupBy,
  format,
  parseISO,
  addDays,
  subDays,
  ptBR,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  loadPolyfills,
};
