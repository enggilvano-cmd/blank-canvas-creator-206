import { useEffect, useState } from 'react';

/**
 * Hook para debounce de valores
 * @param value - Valor a ser debounced
 * @param delay - Delay em milissegundos (padrão: 500ms)
 * @returns Valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Não aplicar debounce se delay for 0
    if (delay === 0) {
      setDebouncedValue(value);
      return;
    }

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
 * Hook otimizado para debounce de filtros
 * Usa 300ms para inputs de texto (mais responsivo)
 * e 150ms para selects/checkboxes (quase instantâneo)
 */
export function useFilterDebounce<T>(value: T, isTextInput: boolean = true): T {
  const delay = isTextInput ? 300 : 150;
  return useDebounce(value, delay);
}
