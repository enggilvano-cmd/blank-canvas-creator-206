import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import App from './App.tsx'
import './index.css'

// Critical imports only - load others lazily
import { SplashScreen } from './components/SplashScreen'
import { logger } from './lib/logger'
import { monitoring } from './lib/monitoring'

// Lazy load heavy modules to reduce initial bundle
const initializeApp = async () => {
  try {
    // Initialize monitoring
    monitoring.initialize();

    // Track session start
    try {
      sessionStorage.setItem('session_start', Date.now().toString());
      const pageLoads = parseInt(sessionStorage.getItem('page_loads') || '0');
      sessionStorage.setItem('page_loads', (pageLoads + 1).toString());
    } catch (e) {
      // Ignore sessionStorage errors
    }

    // Lazy load Sentry only if needed
    if (import.meta.env.PROD) {
      const { initSentry } = await import('./lib/sentry');
      initSentry();
    }

    // Lazy load Web Vitals
    const { initWebVitals } = await import('./lib/webVitals');
    initWebVitals();

    // Lazy load offline database
    const { offlineDatabase } = await import('./lib/offlineDatabase');
    await offlineDatabase.init();
    
    // Background sync - don't block app start
    const { offlineSync } = await import('./lib/offlineSync');
    offlineSync.syncDataFromServer().catch(err => {
      logger.warn('Initial sync failed, will retry when online:', err);
    });
  } catch (error) {
    logger.error('Failed to initialize app modules:', error);
  }
};

function Root() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={() => {
          setShowSplash(false);
          // Initialize heavy modules after splash
          initializeApp();
        }} 
      />
    );
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
