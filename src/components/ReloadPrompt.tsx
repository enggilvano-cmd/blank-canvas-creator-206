import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { offlineSync } from '@/lib/offlineSync';
import { logger } from '@/lib/logger';

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      logger.info('Service Worker registered', r);
      if (r) {
        // Verificar atualizações a cada hora
        setInterval(() => {
          logger.info('Checking for sw update');
          r.update();
        }, 60 * 60 * 1000);
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
        description: "O aplicativo está pronto para funcionar offline.",
      });
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (needRefresh) {
      logger.info('New content available, showing reload prompt');
      toast({
        title: "Nova versão disponível",
        description: "Uma nova versão do aplicativo está disponível.",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateServiceWorker(true)}
          >
            Atualizar
          </Button>
        ),
        duration: Infinity,
      });
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
