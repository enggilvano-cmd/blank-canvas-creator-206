import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/lib/queryClient';
import { QueryInvalidationHelper } from '@/lib/queryInvalidationHelper';

/**
 * ✅ P2-1 FIX: Custom hook para invalidação consistente de queries
 * 
 * Centraliza padrões duplicados de invalidação:
 * - transactionsBase + accounts (transações e saldos)
 * - categories (categorias)
 * - Etc.
 * 
 * Uso:
 * const { invalidateTransactions, invalidateCategories } = useQueryInvalidation();
 * await invalidateTransactions();
 */

export function useQueryInvalidation() {
  const queryClient = useQueryClient();
  const helper = new QueryInvalidationHelper(queryClient);

  /**
   * Invalida transações e contas (padrão mais comum)
   * Usado após criar/editar/deletar transações
   */
  const invalidateTransactions = useCallback(
    async (options = {}) => {
      await helper.invalidateMultiple([
        queryKeys.transactionsBase,
        queryKeys.accounts,
      ], {
        refetch: true,
        ...options,
      });
    },
    [helper]
  );

  /**
   * Invalida apenas categorias
   * Usado após criar/editar/deletar categorias
   */
  const invalidateCategories = useCallback(
    async (options = {}) => {
      await helper.invalidate(queryKeys.categories, {
        refetch: true,
        ...options,
      });
    },
    [helper]
  );

  /**
   * Invalida apenas contas
   * Usado após editar saldo ou tipo de conta
   */
  const invalidateAccounts = useCallback(
    async (options = {}) => {
      await helper.invalidate(queryKeys.accounts, {
        refetch: true,
        ...options,
      });
    },
    [helper]
  );

  /**
   * Invalida tudo (após backup restore, import, etc.)
   */
  const invalidateAll = useCallback(
    async (options = {}) => {
      await helper.invalidateMultiple([
        queryKeys.transactionsBase,
        queryKeys.accounts,
        queryKeys.categories,
        queryKeys.creditBills(),
        queryKeys.periodClosures,
        queryKeys.chartOfAccounts,
      ], {
        parallel: true,
        refetch: true,
        ...options,
      });
    },
    [helper]
  );

  return {
    invalidateTransactions,
    invalidateCategories,
    invalidateAccounts,
    invalidateAll,
    // Helper direto para casos especiais
    helper,
  };
}

/**
 * Legacy support: Função para refetch com delay (mantém compatibilidade)
 */
export function refetchWithDelay(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKeysToFetch: readonly (readonly unknown[])[]
): void {
  const helper = new QueryInvalidationHelper(queryClient);
  
  // Usa delay padrão de 10ms
  queryKeysToFetch.forEach(key => {
    helper.invalidate(key, { delay: 10, refetch: true }).catch(err => {
      console.error('Error refetching query:', key, err);
    });
  });
}
