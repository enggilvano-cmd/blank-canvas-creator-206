import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from '@/lib/safeStorage';
import { logger } from '@/lib/logger';
import { ZodSchema } from 'zod';

/**
 * Hook genérico para persistir filtros no localStorage com validação
 * @param storageKey - Chave única para armazenar os filtros (ex: 'dashboard-filters', 'transactions-filters')
 * @param initialState - Estado inicial dos filtros
 * @param schema - (Opcional) Schema Zod para validação dos dados restaurados
 * @returns [state, setState] - Estado persistido e função para atualizá-lo
 */
export function usePersistedFilters<T>(
  storageKey: string,
  initialState: T,
  schema?: ZodSchema
): [T, (newState: T | ((prev: T) => T)) => void] {
  const [state, setStateInternal] = useState<T>(() => {
    try {
      // Tentar recuperar do localStorage na inicialização
      const stored = safeStorage.getJSON<T>(storageKey);
      
      if (stored === null) {
        return initialState;
      }

      // Validar com schema se fornecido
      if (schema) {
        const validationResult = schema.safeParse(stored);
        if (!validationResult.success) {
          logger.warn(`Invalid persisted filters for "${storageKey}", using defaults`, {
            errors: validationResult.error.errors
          });
          return initialState;
        }
        return validationResult.data as T;
      }

      return stored;
    } catch (error) {
      logger.error(`Error loading persisted filters from "${storageKey}"`, { error });
      return initialState;
    }
  });

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    setStateInternal((prevState) => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(prevState)
        : newState;
      
      try {
        // Validar antes de persistir se schema fornecido
        if (schema) {
          const validationResult = schema.safeParse(nextState);
          if (!validationResult.success) {
            logger.error(`Invalid filters for "${storageKey}"`, {
              errors: validationResult.error.errors
            });
            return prevState; // Manter estado anterior se validação falhar
          }
        }

        // Persistir no localStorage
        safeStorage.setJSON(storageKey, nextState);
      } catch (error) {
        logger.error(`Error saving persisted filters to "${storageKey}"`, { error });
      }
      
      return nextState;
    });
  }, [storageKey, schema]);

  // Sincronizar mudanças entre abas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const newState = JSON.parse(e.newValue) as T;
          
          // Validar se schema fornecido
          if (schema) {
            const validationResult = schema.safeParse(newState);
            if (!validationResult.success) {
              logger.warn(`Invalid data from storage event for "${storageKey}"`);
              return;
            }
            setStateInternal(validationResult.data as T);
          } else {
            setStateInternal(newState);
          }
        } catch (error) {
          logger.error('Error parsing storage event:', { error });
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey, schema]);

  return [state, setState];
}
