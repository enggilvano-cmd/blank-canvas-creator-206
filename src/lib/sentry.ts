import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from 'react-router-dom';

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  // Only initialize if DSN is provided and not in development
  if (!dsn || import.meta.env.DEV) {
    // Sentry not initialized in development or without DSN
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions in production
    
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
    
    // Environment
    environment: import.meta.env.MODE,
    
    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || 'unknown',
    
    // Before send hook to add additional context
    beforeSend(event, hint) {
      // Filter out development errors
      if (import.meta.env.DEV) {
        return null;
      }
      
      // Add custom tags
      event.tags = {
        ...event.tags,
        app_version: import.meta.env.VITE_APP_VERSION || 'unknown',
        build_time: import.meta.env.VITE_BUILD_TIME || 'unknown',
        git_commit: import.meta.env.VITE_GIT_COMMIT || 'unknown',
      };

      // Add custom context
      event.contexts = {
        ...event.contexts,
        app: {
          name: 'Plani',
          version: import.meta.env.VITE_APP_VERSION || 'unknown',
          environment: import.meta.env.MODE,
        },
        runtime: {
          name: 'browser',
          version: navigator.userAgent,
        },
        device: {
          online: navigator.onLine,
          memory: ('memory' in performance && (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize)
            ? `${((performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`
            : 'unknown',
        },
      };

      // Add session information
      try {
        const sessionStart = sessionStorage.getItem('session_start');
        const sessionDuration = sessionStart 
          ? Date.now() - parseInt(sessionStart)
          : 0;
        
        event.contexts.session = {
          start: sessionStart || 'unknown',
          duration_ms: sessionDuration,
          page_loads: parseInt(sessionStorage.getItem('page_loads') || '0'),
        };
      } catch (e) {
        // Ignore sessionStorage errors
      }
      
      return event;
    },
  });
};

// Helper to set user context
export const setSentryUser = (user: { id: string; email?: string; username?: string; role?: string } | null) => {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username || user.email,
      role: user.role,
    });
  } else {
    Sentry.setUser(null);
  }
};

// Helper to add breadcrumb
export const addSentryBreadcrumb = (message: string, category: string, level: Sentry.SeverityLevel = 'info', data?: Record<string, unknown>) => {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
};

// Helper to capture exception manually
export const captureException = (error: Error, context?: Record<string, unknown>) => {
  Sentry.captureException(error, {
    extra: context,
  });
};

// Helper to capture message
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>) => {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
};

// Helper to set context
export const setSentryContext = (key: string, context: Record<string, unknown>) => {
  Sentry.setContext(key, context);
};

// Helper to set tags
export const setSentryTags = (tags: Record<string, string | number | boolean>) => {
  Sentry.setTags(tags);
};

// Helper to add performance measurement
export const addPerformanceMeasurement = (name: string, duration: number, tags?: Record<string, string>) => {
  addSentryBreadcrumb(
    `Performance: ${name}`,
    'performance',
    duration > 1000 ? 'warning' : 'info',
    { duration_ms: duration, ...tags }
  );
  
  // Set tags para análise
  if (tags) {
    setSentryTags(tags);
  }
};

// Helper para track user actions
export const trackUserAction = (action: string, category: string, data?: Record<string, unknown>) => {
  addSentryBreadcrumb(
    action,
    `user.${category}`,
    'info',
    data
  );
};
