import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineSync } from '@/lib/offlineSync';
import { logger } from '@/lib/logger';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export function OfflineSyncIndicator() {
  const isOnline = useOnlineStatus();
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isSyncing: false, activeLocks: 0 });

  useEffect(() => {
    const checkQueue = async () => {
      const operations = await offlineQueue.getAll();
      setQueueCount(operations.length);
      
      // Check sync status for race condition debugging
      const status = offlineSync.getStatus();
      setSyncStatus(status);
    };

    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    
    // Cleanup sync resources on unmount
    return () => {
      clearInterval(interval);
      if (syncStatus.activeLocks > 0) {
        logger.debug('OfflineSyncIndicator unmounting, cleaning up sync resources');
        offlineSync.cleanup();
      }
    };
  }, []);

  useEffect(() => {
    if (isOnline && queueCount > 0) {
      handleSync();
    }
  }, [isOnline]);

  const handleSync = async () => {
    if (syncStatus.isSyncing) {
      logger.info('Sync already in progress, skipping duplicate request');
      return;
    }

    setIsSyncing(true);
    try {
      await offlineSync.syncAll();
      const operations = await offlineQueue.getAll();
      setQueueCount(operations.length);
    } catch (error) {
      // Silent background sync: errors are not shown to the user via toast
      logger.debug('Offline sync error', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceAbort = () => {
    logger.warn('User requested force abort of sync');
    offlineSync.abortSync();
    setIsSyncing(false);
  };

  if (!isOnline) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
        <WifiOff className="h-4 w-4" />
        <span className="text-body">Offline</span>
        {queueCount > 0 && (
          <span className="text-caption bg-destructive-foreground/20 px-2 py-0.5 rounded">
            {queueCount} pendente{queueCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  }

  if (queueCount > 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg">
        <Wifi className="h-4 w-4" />
        <span className="text-body">Online</span>
        <span className="text-caption bg-primary-foreground/20 px-2 py-0.5 rounded">
          {queueCount} pendente{queueCount > 1 ? 's' : ''}
        </span>
        {syncStatus.activeLocks > 0 && (
          <span className="text-xs opacity-70">
            {syncStatus.activeLocks} locks
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSync}
          disabled={isSyncing || syncStatus.isSyncing}
          className="h-6 px-2"
          title={syncStatus.isSyncing ? "Sync em andamento" : "Sincronizar agora"}
        >
          <RefreshCw className={`h-3 w-3 ${(isSyncing || syncStatus.isSyncing) ? 'animate-spin' : ''}`} />
        </Button>
        {(isSyncing || syncStatus.isSyncing) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleForceAbort}
            className="h-6 px-2 text-destructive"
            title="Cancelar sincronização"
          >
            ×
          </Button>
        )}
      </div>
    );
  }

  return null;
}
