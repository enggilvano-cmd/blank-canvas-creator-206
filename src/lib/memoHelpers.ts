/**
 * 📚 BIBLIOTECA DE COMPONENTES MEMOIZADOS
 * 
 * Componentes otimizados com React.memo para prevenir re-renders desnecessários.
 * Use estes wrappers para componentes que recebem props complexas.
 */

import { memo, ComponentType } from 'react';
import { shallowEqual } from './performanceOptimizations';

/**
 * Helper para criar componentes memoizados com shallow comparison
 */
export function memoWithShallowCompare<P extends object>(
  Component: ComponentType<P>,
  displayName?: string
): ComponentType<P> {
  const MemoizedComponent = memo(Component, (prevProps, nextProps) => {
    return shallowEqual(prevProps as Record<string, unknown>, nextProps as Record<string, unknown>);
  });

  if (displayName) {
    MemoizedComponent.displayName = displayName;
  }

  return MemoizedComponent;
}

/**
 * Helper para criar componentes memoizados com deep comparison (use com cuidado!)
 */
export function memoWithDeepCompare<P extends object>(
  Component: ComponentType<P>,
  displayName?: string
): ComponentType<P> {
  const MemoizedComponent = memo(Component, (prevProps, nextProps) => {
    return JSON.stringify(prevProps) === JSON.stringify(nextProps);
  });

  if (displayName) {
    MemoizedComponent.displayName = displayName;
  }

  return MemoizedComponent;
}

/**
 * Helper para criar componentes memoizados com custom comparator
 */
export function memoWithCustomCompare<P extends object>(
  Component: ComponentType<P>,
  comparator: (prevProps: P, nextProps: P) => boolean,
  displayName?: string
): ComponentType<P> {
  const MemoizedComponent = memo(Component, comparator);

  if (displayName) {
    MemoizedComponent.displayName = displayName;
  }

  return MemoizedComponent;
}

/**
 * Lista de props comuns que devem ser comparadas por referência (não valor)
 * Use para evitar re-renders quando callbacks não mudam
 */
export const REFERENCE_PROPS = [
  'onClick',
  'onChange',
  'onSubmit',
  'onEdit',
  'onDelete',
  'onSave',
  'onCancel',
  'onClose',
  'onOpen',
  'children',
] as const;

/**
 * Helper para comparar props ignorando callbacks (assume que são estáveis)
 */
export function comparePropsIgnoringCallbacks<P extends Record<string, unknown>>(
  prevProps: P,
  nextProps: P
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) return false;

  return prevKeys.every(key => {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    // Assume callbacks são estáveis se são do mesmo tipo
    if (typeof prevValue === 'function' && typeof nextValue === 'function') {
      return true;
    }

    return prevValue === nextValue;
  });
}
