import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      logger.info('Connection restored - online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      logger.warn('Connection lost - offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
