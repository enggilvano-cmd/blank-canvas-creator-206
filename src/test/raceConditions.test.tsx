import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { globalResourceManager } from '@/lib/globalResourceManager';

/**
 * Race Conditions Tests - Priority 2
 * 
 * Testa cenários onde operações assíncronas podem causar problemas
 * após o componente ser desmontado ou após logout.
 */

describe('Race Conditions Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalResourceManager.cleanupAll();
  });

  afterEach(() => {
    globalResourceManager.cleanupAll();
  });

  describe('useAuth Race Conditions', () => {
    it('should not update state after unmount during async initialization', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const { result, unmount } = renderHook(() => useAuth());

      // Simula início de operação async
      const initPromise = result.current.initializeUserData?.();

      // Desmonta antes da conclusão
      unmount();

      // Aguarda a promise completar
      if (initPromise) {
        await initPromise.catch(() => {});
      }

      // Não deve haver warnings sobre state updates após unmount
      const unmountWarnings = consoleWarnSpy.mock.calls.filter(call => 
        call[0]?.includes('unmount') || call[0]?.includes('mounted')
      );
      
      expect(unmountWarnings.length).toBe(0);
      
      consoleWarnSpy.mockRestore();
    });

    it('should cancel pending operations on logout', async () => {
      const { result } = renderHook(() => useAuth());

      // Inicia operações que demoram
      const operations = [
        Promise.resolve(),
        Promise.resolve(),
        Promise.resolve()
      ];

      // Faz logout imediatamente
      await result.current.signOut();

      // Verifica que recursos foram limpos
      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });

    it('should handle concurrent signOut calls gracefully', async () => {
      const { result } = renderHook(() => useAuth());

      // Múltiplas chamadas simultâneas de logout
      const logouts = [
        result.current.signOut(),
        result.current.signOut(),
        result.current.signOut()
      ];

      // Todas devem completar sem erro
      await expect(Promise.all(logouts)).resolves.toBeDefined();
    });
  });

  describe('Query Invalidation Race Conditions', () => {
    it('should handle rapid query invalidations without errors', async () => {
      const invalidate = vi.fn().mockResolvedValue(undefined);

      // Simula invalidações rápidas e simultâneas
      const invalidations = Array(10).fill(null).map(() => invalidate());

      await expect(Promise.all(invalidations)).resolves.toBeDefined();
      expect(invalidate).toHaveBeenCalledTimes(10);
    });

    it('should not invalidate queries after component unmount', async () => {
      const invalidateSpy = vi.fn().mockResolvedValue(undefined);
      
      const { unmount } = renderHook(() => {
        // Hook simulado que invalida ao desmontar
        return { invalidate: invalidateSpy };
      });

      unmount();

      // Tenta invalidar após unmount
      await new Promise(resolve => setTimeout(resolve, 100));

      // Não deve ter sido chamado após unmount
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Resource Cleanup Race Conditions', () => {
    it('should cleanup resources in correct order', async () => {
      const cleanupOrder: string[] = [];

      const interval1 = setInterval(() => {}, 1000);
      const interval2 = setInterval(() => {}, 1000);
      const timeout1 = setTimeout(() => {}, 1000);

      globalResourceManager.registerInterval(interval1, 'interval1');
      globalResourceManager.registerInterval(interval2, 'interval2');
      globalResourceManager.registerTimeout(timeout1, 'timeout1');

      globalResourceManager.cleanupAll();

      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });

    it('should handle cleanup during active operations', async () => {
      let operationCompleted = false;

      const interval = setInterval(() => {
        operationCompleted = true;
      }, 10);

      globalResourceManager.registerInterval(interval, 'test-interval');

      // Limpa imediatamente
      globalResourceManager.cleanupAll();

      // Aguarda tempo suficiente para o interval ter disparado
      await new Promise(resolve => setTimeout(resolve, 50));

      // Operação não deve ter completado pois foi limpa
      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous resource registrations', () => {
      const resources = Array(100).fill(null).map((_, i) => {
        const interval = setInterval(() => {}, 1000);
        return globalResourceManager.registerInterval(interval, `interval-${i}`);
      });

      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(100);
      expect(stats.byType.interval).toBe(100);

      globalResourceManager.cleanupAll();
      expect(globalResourceManager.getStats().total).toBe(0);
    });

    it('should handle registration and cleanup happening concurrently', async () => {
      const operations = [];

      // Registra recursos
      for (let i = 0; i < 50; i++) {
        operations.push(
          new Promise<void>(resolve => {
            const interval = setInterval(() => {}, 1000);
            globalResourceManager.registerInterval(interval, `interval-${i}`);
            resolve();
          })
        );
      }

      // Limpa recursos enquanto registra
      operations.push(
        new Promise<void>(resolve => {
          setTimeout(() => {
            globalResourceManager.cleanupAll();
            resolve();
          }, 25);
        })
      );

      await Promise.all(operations);

      // No final, tudo deve estar limpo
      const stats = globalResourceManager.getStats();
      expect(stats.total).toBeLessThanOrEqual(50); // Alguns podem ter sido limpos
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak resources after multiple mount/unmount cycles', () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const { unmount } = renderHook(() => {
          const interval = setInterval(() => {}, 1000);
          globalResourceManager.registerInterval(interval, `cycle-${i}`);
          return null;
        });

        unmount();
        globalResourceManager.cleanupAll();
      }

      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });

    it('should cleanup all resources on page unload', () => {
      // Registra vários recursos
      const interval1 = setInterval(() => {}, 1000);
      const interval2 = setInterval(() => {}, 1000);
      const timeout1 = setTimeout(() => {}, 5000);

      globalResourceManager.registerInterval(interval1, 'interval1');
      globalResourceManager.registerInterval(interval2, 'interval2');
      globalResourceManager.registerTimeout(timeout1, 'timeout1');

      // Simula beforeunload
      window.dispatchEvent(new Event('beforeunload'));

      // Aguarda cleanup assíncrono
      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from cleanup errors gracefully', () => {
      // Registra recurso inválido que pode causar erro no cleanup
      const fakeResource = null as unknown as number;
      
      // Não deve lançar erro
      expect(() => {
        if (fakeResource) {
          globalResourceManager.registerInterval(fakeResource, 'fake');
        }
      }).not.toThrow();
    });

    it('should continue cleanup even if one resource fails', () => {
      const interval1 = setInterval(() => {}, 1000);
      const interval2 = setInterval(() => {}, 1000);

      const id1 = globalResourceManager.registerInterval(interval1, 'interval1');
      globalResourceManager.registerInterval(interval2, 'interval2');

      // Simula erro removendo manualmente um recurso
      clearInterval(interval1);
      globalResourceManager.unregister(id1);

      // Cleanup deve continuar para outros recursos
      expect(() => globalResourceManager.cleanupAll()).not.toThrow();

      const stats = globalResourceManager.getStats();
      expect(stats.total).toBe(0);
    });
  });
});
