import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    // Enable code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'supabase-vendor': ['@supabase/supabase-js'],
          
          // Heavy components
          'analytics-chunk': ['recharts'],
          'excel-chunk': ['xlsx'],
          'pdf-chunk': ['jspdf', 'html-to-image'],
          'date-chunk': ['date-fns'],
          
          // App chunks
          'components-chunk': [
            './src/components/AnalyticsPage.tsx',
            './src/components/FixedTransactionsPage.tsx',
            './src/components/TransactionsPage.tsx'
          ],
          'import-chunk': [
            './src/components/ImportTransactionsModal.tsx',
            './src/components/ImportAccountsModal.tsx',
            './src/components/ImportCategoriesModal.tsx'
          ]
        },
        // Optimize chunk size
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name?.includes('vendor')) {
            return 'assets/vendor/[name]-[hash].js';
          }
          return 'assets/chunks/[name]-[hash].js';
        },
      },
    },
    // Optimize build performance
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: mode === 'development',
    
    // ✅ BUG FIX #20: Performance budgets
    // Enforce bundle size limits to prevent performance degradation
    chunkSizeWarningLimit: 500, // Warn at 500KB (reduced from 1000KB)
    
    // Report large chunks
    reportCompressedSize: true,
    
    // CSS code splitting
    cssCodeSplit: true,
  },
  
  // ✅ BUG FIX #20: Performance budgets configuration
  // These limits ensure the app stays fast
  performance: {
    // Thresholds for warnings (in KB)
    maxEntrypointSize: 400, // Main entry point should be < 400KB
    maxAssetSize: 300,      // Individual assets should be < 300KB
    hints: mode === 'production' ? 'warning' : false,
  },
  // Enable tree shaking
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'es-toolkit/compat/get'
    ],
    exclude: [
      'xlsx',
      'jspdf',
      'html-to-image'
    ]
  },
  // Fix ESM compatibility issues
  ssr: {
    noExternal: ['recharts', 'es-toolkit']
  },
  define: {
    // Remove unused environment variables
    'process.env.NODE_ENV': JSON.stringify(mode),
    'global': 'globalThis',
  },
  plugins: [
    react(),
    componentTagger(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifestFilename: 'manifest.webmanifest',
      manifest: false, // Usar o manifest.webmanifest do public/
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Performance optimizations
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    minifyIdentifiers: mode === 'production',
    minifySyntax: mode === 'production',
    minifyWhitespace: mode === 'production',
  }
}));