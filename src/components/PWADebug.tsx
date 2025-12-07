import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PWAStatus {
  httpsEnabled: boolean;
  manifestFound: boolean;
  serviceWorkerActive: boolean;
  iconsPng192Found: boolean;
  iconsPng512Found: boolean;
  mobileCapableTag: boolean;
  themeColorTag: boolean;
  installPromptSupported: boolean;
  isInstalled: boolean;
}

export function PWADebug() {
  const [status, setStatus] = useState<PWAStatus>({
    httpsEnabled: false,
    manifestFound: false,
    serviceWorkerActive: false,
    iconsPng192Found: false,
    iconsPng512Found: false,
    mobileCapableTag: false,
    themeColorTag: false,
    installPromptSupported: false,
    isInstalled: false,
  });

  useEffect(() => {
    const checkPWA = async () => {
      // 1. HTTPS
      const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

      // 2. Manifest
      let manifestFound = false;
      try {
        const response = await fetch('/manifest.webmanifest');
        manifestFound = response.ok;
      } catch (e) {
        manifestFound = false;
      }

      // 3. Service Worker
      let serviceWorkerActive = false;
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        serviceWorkerActive = registrations.length > 0;
      } catch (e) {
        serviceWorkerActive = false;
      }

      // 4. Icons
      let iconsPng192Found = false;
      let iconsPng512Found = false;
      try {
        const res192 = await fetch('/logo.svg');
        const res512 = await fetch('/logo.svg');
        iconsPng192Found = res192.ok;
        iconsPng512Found = res512.ok;
      } catch (e) {
        iconsPng192Found = false;
        iconsPng512Found = false;
      }

      // 5. Meta tags
      const mobileCapableTag = !!document.querySelector('meta[name="mobile-web-app-capable"]');
      const themeColorTag = !!document.querySelector('meta[name="theme-color"]');

      // 6. Install prompt support
      const installPromptSupported = 'BeforeInstallPromptEvent' in window && 'serviceWorker' in navigator;

      // 7. Check if installed (display-mode)
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;

      setStatus({
        httpsEnabled: isHttps,
        manifestFound,
        serviceWorkerActive,
        iconsPng192Found,
        iconsPng512Found,
        mobileCapableTag,
        themeColorTag,
        installPromptSupported,
        isInstalled,
      });

      // Log to console
      logger.debug('PWA DEBUG', {
        https: isHttps,
        manifest: manifestFound,
        serviceWorker: serviceWorkerActive,
        icons192: iconsPng192Found,
        icons512: iconsPng512Found,
        mobileCapable: mobileCapableTag,
        themeColor: themeColorTag,
        installPrompt: installPromptSupported,
        installed: isInstalled
      });
    };

    checkPWA();
    const interval = setInterval(checkPWA, 5000);
    return () => clearInterval(interval);
  }, []);

  const allGood = Object.values(status).every(v => v === true);

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          🔧 PWA Debug {allGood ? '✅' : '⚠️'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatusRow 
            label="HTTPS Enabled" 
            status={status.httpsEnabled}
            hint={status.httpsEnabled ? '✅' : '❌ PWA requires HTTPS (localhost OK)'}
          />
          <StatusRow 
            label="Manifest Found" 
            status={status.manifestFound}
            hint={status.manifestFound ? '✅ /manifest.webmanifest' : '❌ Check Network tab'}
          />
          <StatusRow 
            label="Service Worker" 
            status={status.serviceWorkerActive}
            hint={status.serviceWorkerActive ? '✅ Registered' : '❌ Check console errors'}
          />
          <StatusRow 
            label="Icons 192px" 
            status={status.iconsPng192Found}
            hint={status.iconsPng192Found ? '✅ Found' : '❌ /logo.svg'}
          />
          <StatusRow 
            label="Icons 512px" 
            status={status.iconsPng512Found}
            hint={status.iconsPng512Found ? '✅ Found' : '❌ /logo.svg'}
          />
          <StatusRow 
            label="Mobile Meta Tag" 
            status={status.mobileCapableTag}
            hint={status.mobileCapableTag ? '✅' : '❌ meta name="mobile-web-app-capable"'}
          />
          <StatusRow 
            label="Theme Color" 
            status={status.themeColorTag}
            hint={status.themeColorTag ? '✅' : '❌ meta name="theme-color"'}
          />
          <StatusRow 
            label="Install Prompt Support" 
            status={status.installPromptSupported}
            hint={status.installPromptSupported ? '✅' : '❌ Browser/SW not ready'}
          />
          <StatusRow 
            label="App Installed" 
            status={status.isInstalled}
            hint={status.isInstalled ? '✅ Running as app' : 'ℹ️ Not installed yet'}
          />
        </div>

        <div className="mt-4 p-3 bg-white rounded border border-gray-200 text-sm">
          <p className="font-semibold mb-2">🧪 Debug Instructions:</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700">
            <li>Open DevTools → Application → Manifest</li>
            <li>Check "Service Workers" tab for active SW</li>
            <li>If all ✅, PWA is ready to install</li>
            <li>On Android Chrome: Menu → "Install app"</li>
            <li>Open Network tab to check icon URLs</li>
          </ul>
        </div>

        {!allGood && (
          <div className="mt-4 p-3 bg-red-50 rounded border border-red-200 text-sm text-red-700">
            <p className="font-semibold mb-2">⚠️ Issues Found:</p>
            {!status.httpsEnabled && <p>• Not HTTPS (or not localhost) - PWA won't work</p>}
            {!status.manifestFound && <p>• Manifest not accessible - check /manifest.webmanifest</p>}
            {!status.serviceWorkerActive && <p>• Service Worker not registered - check console for errors</p>}
            {!status.iconsPng192Found && <p>• 192px icon missing - add /public/logo.svg</p>}
            {!status.iconsPng512Found && <p>• 512px icon missing - add /public/logo.svg</p>}
            {!status.mobileCapableTag && <p>• Missing mobile-web-app-capable meta tag</p>}
            {!status.themeColorTag && <p>• Missing theme-color meta tag</p>}
            {!status.installPromptSupported && <p>• Browser doesn't support install prompt</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatusRowProps {
  label: string;
  status: boolean;
  hint?: string;
}

function StatusRow({ label, status, hint }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint && <p className="text-xs text-gray-600">{hint}</p>}
      </div>
      <Badge variant={status ? 'default' : 'destructive'}>
        {status ? '✅' : '❌'}
      </Badge>
    </div>
  );
}
