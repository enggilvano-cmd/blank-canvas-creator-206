import { useEffect, useState } from 'react';
import { pwaUpdateManager, type PWAUpdateConfig } from '@/lib/pwaUpdateManager';
import { logger } from '@/lib/logger';

interface PWAStatus {
  isSupported: boolean;
  isRegistered: boolean;
  currentVersion: string;
  currentBuildTime?: string | null;
  hasWaitingSW: boolean;
}

interface UsePWAUpdateReturn {
  status: PWAStatus;
  isChecking: boolean;
  isUpdating: boolean;
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  forceReinstall: () => Promise<void>;
  error: Error | null;
}

/**
 * Hook para gerenciar atualizações do PWA em componentes
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, isUpdating, applyUpdate, error } = usePWAUpdate();
 * 
 *   return (
 *     <div>
 *       <p>Versão: {status.currentVersion}</p>
 *       <button 
 *         onClick={applyUpdate}
 *         disabled={isUpdating}
 *       >
 *         {isUpdating ? 'Atualizando...' : 'Atualizar'}
 *       </button>
 *       {error && <p style={{ color: 'red' }}>{error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePWAUpdate(config?: PWAUpdateConfig): UsePWAUpdateReturn {
  const [status, setStatus] = useState<PWAStatus>(pwaUpdateManager.getStatus());
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Subscrever a mudanças do gerenciador de atualizações
  useEffect(() => {
    const handleUpdate = () => {
      setStatus(pwaUpdateManager.getStatus());
    };

    // Registrar listener
    const unsubscribe = pwaUpdateManager.subscribe(handleUpdate);
    
    // Atualização inicial imediata para garantir sincronia
    handleUpdate();
    
    // Forçar verificação ao montar para garantir dados frescos
    pwaUpdateManager.checkForUpdates().catch(() => {});

    // Manter polling como fallback para status do navegador que podem mudar sem eventos
    const interval = setInterval(handleUpdate, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      setError(null);
      logger.info('Checking for PWA updates via hook');
      const hasUpdate = await pwaUpdateManager.checkForUpdates();
      setStatus(pwaUpdateManager.getStatus());
      
      if (hasUpdate) {
        logger.info('Update available');
      }
    } catch (err) {
      const error = err as Error;
      logger.error('Error checking for updates', error);
      setError(error);
    } finally {
      setIsChecking(false);
    }
  };

  const applyUpdate = async () => {
    try {
      setIsUpdating(true);
      setError(null);
      logger.info('Applying PWA update via hook');
      await pwaUpdateManager.applyUpdate();
    } catch (err) {
      const error = err as Error;
      logger.error('Error applying update', error);
      setError(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const forceReinstall = async () => {
    try {
      setIsUpdating(true);
      setError(null);
      logger.info('Force reinstalling PWA via hook');
      await pwaUpdateManager.forceReinstall();
    } catch (err) {
      const error = err as Error;
      logger.error('Error force reinstalling', error);
      setError(error);
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    status,
    isChecking,
    isUpdating,
    checkForUpdates,
    applyUpdate,
    forceReinstall,
    error,
  };
}
