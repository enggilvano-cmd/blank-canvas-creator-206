import { QueryClient } from '@tanstack/react-query';
import { logger } from './logger';

/**
 * Query Invalidation Helper - Priority 2
 * 
 * Centraliza a lógica de invalidação de queries para reduzir duplicação
 * e garantir consistência em todo o código.
 * 
 * Problemas resolvidos:
 * - Código duplicado em múltiplos hooks (9+ locais)
 * - Invalidações inconsistentes
 * - Race conditions durante invalidações simultâneas
 * - Dificuldade em debug de cache issues
 */

export interface InvalidationOptions {
  /**
   * Se true, aguarda as queries serem refetchadas
   * @default false
   */
  refetch?: boolean;
  
  /**
   * Se true, força refetch mesmo se a query estiver atualizada
   * @default false
   */
  force?: boolean;
  
  /**
   * Delay em ms antes de invalidar (útil para debounce)
   * @default 0
   */
  delay?: number;
  
  /**
   * Se true, não loga a invalidação (para operações batch)
   * @default false
   */
  silent?: boolean;

  /**
   * Se true, invalida queries exatas. Se false, invalida por prefixo
   * @default false
   */
  exact?: boolean;
}

export interface BatchInvalidationOptions extends InvalidationOptions {
  /**
   * Se true, invalida em paralelo. Se false, invalida sequencialmente
   * @default true
   */
  parallel?: boolean;
}

/**
 * Helper principal para invalidação de queries
 */
export class QueryInvalidationHelper {
  private pendingInvalidations = new Set<string>();

  constructor(private queryClient: QueryClient) {}

  /**
   * Invalida uma única query
   */
  async invalidate(
    queryKey: readonly unknown[],
    options: InvalidationOptions = {}
  ): Promise<void> {
    const {
      refetch = false,
      force = false,
      delay = 0,
      silent = false,
      exact = false
    } = options;

    const keyString = JSON.stringify(queryKey);

    // Previne invalidações duplicadas simultâneas
    if (this.pendingInvalidations.has(keyString)) {
      if (!silent) {
        logger.debug('Skipping duplicate invalidation:', queryKey);
      }
      return;
    }

    this.pendingInvalidations.add(keyString);

    try {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (!silent) {
        logger.debug('Invalidating query:', queryKey);
      }

      await this.queryClient.invalidateQueries({
        queryKey: queryKey as unknown[],
        exact,
        refetchType: force ? 'active' : refetch ? 'active' : 'none'
      });

      if (refetch && !force) {
        await this.queryClient.refetchQueries({
          queryKey: queryKey as unknown[],
          exact,
          type: 'active'
        });
      }
    } finally {
      this.pendingInvalidations.delete(keyString);
    }
  }

  /**
   * Invalida múltiplas queries em batch
   */
  async invalidateMultiple(
    queryKeys: readonly (readonly unknown[])[],
    options: BatchInvalidationOptions = {}
  ): Promise<void> {
    const { parallel = true, silent = true, ...invalidationOptions } = options;

    if (!silent) {
      logger.debug(`Invalidating ${queryKeys.length} queries in batch (${parallel ? 'parallel' : 'sequential'})`);
    }

    if (parallel) {
      await Promise.all(
        queryKeys.map(key => 
          this.invalidate(key, { ...invalidationOptions, silent: true })
        )
      );
    } else {
      for (const key of queryKeys) {
        await this.invalidate(key, { ...invalidationOptions, silent: true });
      }
    }

    if (!silent) {
      logger.debug('Batch invalidation complete');
    }
  }

  /**
   * Invalida todas as queries que correspondem a um prefixo
   */
  async invalidateByPrefix(
    prefix: readonly unknown[],
    options: InvalidationOptions = {}
  ): Promise<void> {
    const { silent = false, ...otherOptions } = options;

    if (!silent) {
      logger.debug('Invalidating queries by prefix:', prefix);
    }

    return this.invalidate(prefix, { ...otherOptions, exact: false, silent });
  }

  /**
   * Refetch queries com delay (padrão usado no código atual)
   */
  refetchWithDelay(
    queryKeys: readonly (readonly unknown[])[],
    delay: number = 10
  ): void {
    setTimeout(() => {
      queryKeys.forEach(key => {
        this.queryClient.refetchQueries({ queryKey: key as unknown[] });
      });
    }, delay);
  }

  /**
   * Remove uma query do cache completamente
   */
  remove(queryKey: readonly unknown[], options: { silent?: boolean } = {}): void {
    const { silent = false } = options;

    if (!silent) {
      logger.debug('Removing query from cache:', queryKey);
    }

    this.queryClient.removeQueries({ queryKey: queryKey as unknown[] });
  }

  /**
   * Reseta todas as queries (útil para logout)
   */
  async resetAll(options: { silent?: boolean } = {}): Promise<void> {
    const { silent = false } = options;

    if (!silent) {
      logger.info('Resetting all queries');
    }

    await this.queryClient.resetQueries();
  }

  /**
   * Cancela queries em execução
   */
  async cancelQueries(queryKey: readonly unknown[]): Promise<void> {
    logger.debug('Cancelling queries:', queryKey);
    await this.queryClient.cancelQueries({ queryKey: queryKey as unknown[] });
  }

  /**
   * Utilitário: invalida queries relacionadas a transações
   */
  async invalidateTransactionQueries(options: InvalidationOptions = {}): Promise<void> {
    await this.invalidateMultiple(
      [
        ['transactions'],
        ['accounts'],
        ['dashboard']
      ],
      { ...options, parallel: true }
    );
  }

  /**
   * Utilitário: invalida queries relacionadas a contas
   */
  async invalidateAccountQueries(options: InvalidationOptions = {}): Promise<void> {
    await this.invalidateMultiple(
      [
        ['accounts'],
        ['transactions'],
        ['dashboard']
      ],
      { ...options, parallel: true }
    );
  }

  /**
   * Utilitário: invalida queries relacionadas a categorias
   */
  async invalidateCategoryQueries(options: InvalidationOptions = {}): Promise<void> {
    await this.invalidateMultiple(
      [
        ['categories'],
        ['transactions']
      ],
      { ...options, parallel: true }
    );
  }

  /**
   * Utilitário: invalida todas as queries do dashboard
   */
  async invalidateDashboard(options: InvalidationOptions = {}): Promise<void> {
    await this.invalidateByPrefix(['dashboard'], options);
  }

  /**
   * Debug: mostra estatísticas de invalidações pendentes
   */
  getStats() {
    return {
      pendingInvalidations: this.pendingInvalidations.size,
      activeQueries: this.queryClient.getQueryCache().getAll().length,
      queries: this.queryClient.getQueryCache().getAll().map(q => ({
        queryKey: q.queryKey,
        state: q.state.status,
        dataUpdatedAt: q.state.dataUpdatedAt,
        stale: q.isStale()
      }))
    };
  }
}

/**
 * Cria uma instância do helper (será exportada e reutilizada)
 */
export function createQueryInvalidationHelper(queryClient: QueryClient): QueryInvalidationHelper {
  return new QueryInvalidationHelper(queryClient);
}

/**
 * Hook personalizado para usar o helper em componentes React
 */
export function useQueryInvalidation(queryClient: QueryClient): QueryInvalidationHelper {
  // Cria instância única por queryClient
  return new QueryInvalidationHelper(queryClient);
}
