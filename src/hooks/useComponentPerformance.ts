import { useEffect, useRef } from 'react';
import { addPerformanceMeasurement } from '@/lib/sentry';

/**
 * Hook para medir performance de componentes
 * Adiciona breadcrumbs no Sentry com métricas de render
 */
export function useComponentPerformance(componentName: string, enabled = true) {
  const mountTimeRef = useRef<number>(0);
  const renderCountRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !import.meta.env.PROD) return;

    mountTimeRef.current = performance.now();
    renderCountRef.current++;

    return () => {
      const duration = performance.now() - mountTimeRef.current;
      
      // Track apenas se componente ficou montado por tempo significativo
      if (duration > 50) {
        addPerformanceMeasurement(
          `Component: ${componentName}`,
          duration,
          {
            component: componentName,
            render_count: renderCountRef.current.toString(),
          }
        );
      }
    };
  }, [componentName, enabled]);

  // Incrementa contador a cada render
  useEffect(() => {
    if (!enabled || !import.meta.env.PROD) return;
    renderCountRef.current++;
  });
}

/**
 * Hook para medir performance de operações assíncronas
 */
export function useAsyncPerformance() {
  const measureAsync = async <T,>(
    operationName: string,
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> => {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      if (import.meta.env.PROD) {
        addPerformanceMeasurement(
          `Async: ${operationName}`,
          duration,
          {
            operation: operationName,
            status: 'success',
            ...tags,
          }
        );
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      if (import.meta.env.PROD) {
        addPerformanceMeasurement(
          `Async: ${operationName}`,
          duration,
          {
            operation: operationName,
            status: 'error',
            ...tags,
          }
        );
      }
      
      throw error;
    }
  };

  return { measureAsync };
}
