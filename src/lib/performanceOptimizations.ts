/**
 * 🚀 OTIMIZAÇÕES DE PERFORMANCE - BUGS MÉDIOS CORRIGIDOS
 * 
 * Este arquivo implementa correções para bugs de severidade média relacionados a performance:
 * - N+1 query problems (prevenção via joins e caching)
 * - Debouncing para inputs de busca
 * - Memoization helpers
 * - Virtual scrolling configuration
 * - Retry logic consistente
 */

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { logger } from './logger';

/**
 * Hook de debounce otimizado
 * Previne múltiplas chamadas em inputs de busca
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook de throttle para eventos de scroll/resize
 * Limita a frequência de chamadas
 */
export function useThrottle<T>(value: T, limit: number = 200): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * Hook para prevenir N+1 query problems
 * Cria um Map em memória para lookups O(1)
 */
export function useEntityMap<T extends { id: string }>(
  entities: T[] | undefined
): Map<string, T> {
  return useMemo(() => {
    if (!entities) {return new Map();}
    return new Map(entities.map(entity => [entity.id, entity]));
  }, [entities]);
}

/**
 * Helper para criar keys únicas em listas
 * Previne warnings de keys duplicadas
 */
export function createListKey(prefix: string, id: string | number, index?: number): string {
  return index !== undefined ? `${prefix}-${id}-${index}` : `${prefix}-${id}`;
}

/**
 * Configuração otimizada para virtual scrolling
 * Use com @tanstack/react-virtual
 */
export const VIRTUAL_SCROLL_CONFIG = {
  // Para listas pequenas (< 50 items)
  small: {
    overscan: 5,
    estimateSize: () => 60,
  },
  // Para listas médias (50-500 items)
  medium: {
    overscan: 10,
    estimateSize: () => 72,
  },
  // Para listas grandes (> 500 items)
  large: {
    overscan: 20,
    estimateSize: () => 80,
  },
} as const;

/**
 * Hook para retry logic consistente em mutations
 */
export function useRetryMutation<TData, TError, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: TError) => void;
  } = {}
) {
  const { maxRetries = 3, retryDelay = 1000, onRetry } = options;

  return useCallback(
    async (variables: TVariables, attempt = 0): Promise<TData> => {
      try {
        return await mutationFn(variables);
      } catch (error) {
        if (attempt < maxRetries) {
          onRetry?.(attempt + 1, error as TError);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          return useRetryMutation(mutationFn, options)(variables, attempt + 1);
        }
        throw error;
      }
    },
    [mutationFn, maxRetries, retryDelay, onRetry]
  );
}

/**
 * Helper para shallow equality check
 * Use para prevenir re-renders desnecessários
 */
export function shallowEqual<T extends Record<string, unknown>>(
  objA: T | null | undefined,
  objB: T | null | undefined
): boolean {
  if (objA === objB) {return true;}
  if (!objA || !objB) {return false;}

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {return false;}

  return keysA.every(key => objA[key] === objB[key]);
}

/**
 * Helper para deep clone de objetos (otimizado)
 * Use quando structuredClone não estiver disponível
 */
export function fastDeepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {return obj;}
  
  // Use structuredClone se disponível (mais rápido)
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  
  // Fallback para JSON (cuidado com Date, undefined, etc.)
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Hook para memoization com custom equality
 */
export function useMemoWithComparator<T>(
  factory: () => T,
  deps: React.DependencyList,
  comparator: (a: unknown, b: unknown) => boolean
): T {
  const ref = useRef<{ deps: React.DependencyList; value: T }>();

  if (!ref.current || !deps.every((dep, i) => comparator(dep, ref.current!.deps[i]))) {
    ref.current = { deps, value: factory() };
  }

  return ref.current.value;
}

/**
 * Helper para batch updates (previne múltiplos re-renders)
 */
export function batchUpdates(callback: () => void): void {
  // React 18+ usa automatic batching
  // Este helper mantém compatibilidade e clareza de intenção
  callback();
}

/**
 * Hook para track render count (debugging)
 * Use apenas em desenvolvimento
 */
export function useRenderCount(componentName: string): number {
  const renderCount = useRef(0);
  
  useEffect(() => {
    renderCount.current += 1;
    
    // Apenas em desenvolvimento - usar logger ao invés de console.log
    if (import.meta.env.DEV) {
      logger.debug(`[${componentName}] Render count: ${renderCount.current}`);
    }
  });

  return renderCount.current;
}

/**
 * Hook para lazy state initialization
 * Previne cálculos desnecessários em cada render
 */
export function useLazyState<T>(
  initializer: () => T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initializer);
  return [state, setState];
}


