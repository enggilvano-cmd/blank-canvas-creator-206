import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { SettingsProvider } from "@/context/SettingsContext";
import { BybitProvider } from "@/context/BybitContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ReloadPrompt } from "@/components/ReloadPrompt";
import { OfflineSyncIndicator } from "@/components/OfflineSyncIndicator";
import { queryClient } from './lib/queryClient';
import { bundleAnalyzer } from './lib/bundleAnalyzer';

// Lazy load pages for better initial bundle size
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const BybitPage = lazy(() => import("./pages/BybitPage"));
const PWADebug = lazy(() => import("@/components/PWADebug").then(module => ({ default: module.PWADebug })));

// Loading component for Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const App = () => {
  // Track app initialization
  bundleAnalyzer.trackComponentLoad('App');

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsProvider>
            <BybitProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <ReloadPrompt />
                <OfflineSyncIndicator />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route 
                        path="/auth" 
                        element={
                          <RouteErrorBoundary routeName="Autenticação">
                            <Auth />
                          </RouteErrorBoundary>
                        } 
                      />
                      <Route 
                        path="/" 
                        element={
                          <ProtectedRoute>
                            <RouteErrorBoundary routeName="Dashboard">
                              <Index />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        } 
                      />
                      <Route 
                        path="/bybit"
                        element={
                          <ProtectedRoute>
                            <RouteErrorBoundary routeName="Bybit">
                              <BybitPage />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route 
                        path="/debug-pwa" 
                        element={
                          <RouteErrorBoundary routeName="PWA Debug">
                            <PWADebug />
                          </RouteErrorBoundary>
                        } 
                      />
                      <Route 
                        path="*" 
                        element={
                          <RouteErrorBoundary routeName="Página Não Encontrada">
                            <NotFound />
                          </RouteErrorBoundary>
                        } 
                      />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </BybitProvider>
          </SettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
