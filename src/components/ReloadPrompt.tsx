import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useEffect, useRef, useState } from 'react';
import { offlineSync } from '@/lib/offlineSync';
import { logger } from '@/lib/logger';
import { pwaUpdateManager, type PWAUpdateConfig } from '@/lib/pwaUpdateManager';

export function ReloadPrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | undefined>();

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      logger.info('Service Worker registered', r);
      swRegistrationRef.current = r;

      if (r) {
        // Inicializar o gerenciador de atualizações com configuração customizada
        const updateConfig: PWAUpdateConfig = {
          checkInterval: 60 * 60 * 1000, // Verificar a cada 1 hora
          onUpdateAvailable: (registration) => {
            logger.info('PWA update available');
            // O sistema de registro automaticamente mostrará o prompt
          },
          onUpdateApplied: () => {
            logger.info('PWA update applied');
            toast({
              title: "Atualização aplicada com sucesso",
              description: "O aplicativo foi atualizado e recarregado.",
            });
          },
          onUpdateError: (error) => {
            logger.error('PWA update error', error);
            toast({
              title: "Erro na atualização",
              description: "Houve um erro ao atualizar o aplicativo. Por favor, tente novamente.",
              variant: "destructive",
            });
          },
        };

        pwaUpdateManager.init(r, updateConfig).catch((error) => {
          logger.error('Failed to initialize PWA update manager', error);
        });
      }
    },
    onRegisterError(error: Error) {
      logger.error('Service Worker registration error', error);
    },
  });

  // Detecta instalação do PWA e sincroniza dados
  useEffect(() => {
    const handleAppInstalled = async () => {
      logger.info('PWA installed - syncing data for offline use');
      try {
        await offlineSync.syncDataFromServer();
        toast({
          title: "App instalado",
          description: "O aplicativo foi instalado com sucesso e seus dados foram sincronizados.",
        });
      } catch (error) {
        logger.error('Failed to sync data on PWA installation', error);
      }
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (offlineReady) {
      toast({
        title: "App pronto para uso offline",
        description: "O aplicativo está pronto para funcionar offline. Seus dados estão sincronizados.",
      });
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  // Trata atualização do PWA
  useEffect(() => {
    if (needRefresh) {
      logger.info('New content available, showing reload prompt');
      toast({
        title: "Nova versão disponível",
        description: "Uma nova versão do aplicativo está disponível com melhorias e correções.",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUpdate()}
            disabled={isUpdating}
          >
            {isUpdating ? 'Atualizando...' : 'Atualizar'}
          </Button>
        ),
        duration: Infinity,
      });
    }
  }, [needRefresh, isUpdating]);

  /**
   * Realiza atualização automática do PWA
   */
  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      logger.info('Starting PWA update process');

      // Primeiro, atualizar via VitePWA
      await updateServiceWorker(true);

      // Depois aplicar limpeza de caches via gerenciador
      setTimeout(async () => {
        try {
          await pwaUpdateManager.applyUpdate();
        } catch (error) {
          logger.error('Error applying PWA update', error);
          // A página já foi recarregada, não precisa fazer nada
        }
      }, 100);
    } catch (error) {
      logger.error('Error during PWA update', error);
      setIsUpdating(false);
      toast({
        title: "Erro na atualização",
        description: "Houve um erro ao atualizar o aplicativo. Por favor, tente novamente.",
        variant: "destructive",
      });
    }
  };

  /**
   * Força limpeza completa e reinstalação
   */
  const forceReinstall = async () => {
    try {
      logger.info('Forcing PWA reinstallation');
      await pwaUpdateManager.forceReinstall();
    } catch (error) {
      logger.error('Error forcing reinstall', error);
      toast({
        title: "Erro",
        description: "Houve um erro ao fazer a limpeza. Por favor, tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Expor função de força reinstalação globalmente para debug
  useEffect(() => {
    (window as any).forceReinstallPWA = forceReinstall;
    (window as any).pwaStatus = () => pwaUpdateManager.getStatus();

    return () => {
      delete (window as any).forceReinstallPWA;
      delete (window as any).pwaStatus;
    };
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      pwaUpdateManager.destroy();
    };
  }, []);

  return null;
}
