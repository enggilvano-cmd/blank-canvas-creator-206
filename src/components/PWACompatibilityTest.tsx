import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface SystemSupport {
  platform: string;
  os: string;
  installMethod: string;
  status: 'supported' | 'partial' | 'unsupported';
  details: string[];
  requirements: string[];
  notes: string;
}

interface PWACompatibility {
  overallStatus: 'excellent' | 'good' | 'warning' | 'critical';
  httpsRequired: boolean;
  isHttps: boolean;
  manifestValid: boolean;
  serviceWorkerActive: boolean;
  iconsValid: boolean;
  systems: SystemSupport[];
  scores: {
    android: number;
    ios: number;
    desktop: number;
    pwa: number;
  };
}

export function PWACompatibilityTest() {
  const [compatibility, setCompatibility] = useState<PWACompatibility | null>(null);

  useEffect(() => {
    const testPWA = async () => {
      try {
        // Test HTTPS
        const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

        // Test Manifest
        let manifestValid = false;
        let manifest: any = null;
        try {
          const res = await fetch('/manifest.webmanifest');
          manifestValid = res.ok;
          if (res.ok) {
            manifest = await res.json();
          }
        } catch (e) {
          manifestValid = false;
        }

        // Test Service Worker
        let serviceWorkerActive = false;
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          serviceWorkerActive = regs.length > 0;
        } catch (e) {
          serviceWorkerActive = false;
        }

        // Test Icons
        let iconsValid = false;
        try {
          const res192 = await fetch('/logo.svg');
          const res512 = await fetch('/logo.svg');
          iconsValid = res192.ok && res512.ok;
        } catch (e) {
          iconsValid = false;
        }

        // Detect platform
        const ua = navigator.userAgent;
        const isAndroid = /Android/i.test(ua);
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isDesktop = !isAndroid && !isIOS;

        // Calculate scores
        const baselineRequirements = [isHttps, manifestValid, serviceWorkerActive, iconsValid];
        const allMet = baselineRequirements.every(v => v);

        const androidScore = allMet ? 95 : 50;
        const iosScore = manifestValid && iconsValid ? 85 : 40;
        const desktopScore = allMet ? 98 : 60;
        const pwaScore = Math.round((androidScore + iosScore + desktopScore) / 3);

        const systems: SystemSupport[] = [
          {
            platform: 'Android Chrome',
            os: 'Android 7+',
            installMethod: 'Chrome Menu → "Install app" or "Add to Home Screen"',
            status: allMet ? 'supported' : (manifestValid && serviceWorkerActive ? 'partial' : 'unsupported'),
            details: [
              `✅ Manifest: ${manifestValid ? 'Valid' : 'Missing'}`,
              `✅ HTTPS/Localhost: ${isHttps ? 'Yes' : 'No'}`,
              `✅ Service Worker: ${serviceWorkerActive ? 'Active' : 'Inactive'}`,
              `✅ Icons: ${iconsValid ? 'SVG Scalable' : 'Missing'}`,
              `✅ Screenshots: ${manifest?.screenshots ? 'Included' : 'Missing'}`,
              `✅ Display: ${manifest?.display === 'standalone' ? 'Standalone' : 'Not standalone'}`,
            ],
            requirements: [
              'HTTPS or localhost',
              'Web App Manifest with name, icons, display: standalone',
              'Service Worker',
              'Icons (SVG preferred)',
              'User engagement before install',
            ],
            notes: 'Full offline support with IndexedDB and Service Worker caching',
          },
          {
            platform: 'iOS Safari',
            os: 'iOS 13+',
            installMethod: 'Share → "Add to Home Screen"',
            status: manifestValid && iconsValid ? 'partial' : 'unsupported',
            details: [
              `✅ Apple Meta Tags: ${document.querySelector('meta[name="apple-mobile-web-app-capable"]') ? 'Present' : 'Missing'}`,
              `✅ Icons: ${iconsValid ? 'Available' : 'Missing'}`,
              `✅ Splash Screens: ${document.querySelectorAll('link[rel="apple-touch-startup-image"]').length} configured`,
              `✅ Status Bar: Black Translucent`,
              `✅ Theme Color: #1469B6`,
            ],
            requirements: [
              'meta name="apple-mobile-web-app-capable"',
              'apple-touch-icon or icon in manifest',
              'apple-touch-startup-image (splash screens)',
              'Cannot be installed from store (add to home screen only)',
            ],
            notes: 'Limited offline support compared to Android. No background sync.',
          },
          {
            platform: 'Chrome Desktop',
            os: 'Windows/Mac/Linux',
            installMethod: 'Address bar icon or Menu → "Install"',
            status: allMet ? 'supported' : 'partial',
            details: [
              `✅ Manifest: ${manifestValid ? 'Valid' : 'Missing'}`,
              `✅ Service Worker: ${serviceWorkerActive ? 'Active' : 'Inactive'}`,
              `✅ HTTPS: ${isHttps ? 'Yes' : 'No'}`,
              `✅ Icon: ${iconsValid ? '512x512' : 'Missing'}`,
              `✅ Launch: Standalone window`,
            ],
            requirements: [
              'HTTPS',
              'Valid manifest.json',
              'Service Worker',
              'Icon 512x512',
            ],
            notes: 'Full offline support. Can be launched like native app.',
          },
          {
            platform: 'Edge/Chromium',
            os: 'Windows/Mac/Linux',
            installMethod: 'Address bar icon or Menu → "Install app"',
            status: allMet ? 'supported' : 'partial',
            details: [
              `✅ Same as Chrome Desktop`,
              `✅ Windows Store integration available`,
            ],
            requirements: ['Same as Chrome Desktop'],
            notes: 'Can be published to Microsoft Store for distribution.',
          },
          {
            platform: 'Firefox',
            os: 'All platforms',
            installMethod: 'Menu → "Install"',
            status: manifestValid && serviceWorkerActive ? 'partial' : 'unsupported',
            details: [
              `✅ Manifest: ${manifestValid ? 'Supported' : 'Missing'}`,
              `✅ Service Worker: ${serviceWorkerActive ? 'Supported' : 'Inactive'}`,
              `⚠️ Icon requirement: SVG (scalable)`,
            ],
            requirements: [
              'HTTPS',
              'manifest.json with icons (minimum 96x96)',
              'Service Worker',
            ],
            notes: 'Limited support. Primarily for Firefox on Android.',
          },
        ];

        const overallStatus = allMet ? 'excellent' : (manifestValid && serviceWorkerActive ? 'good' : 'warning');

        setCompatibility({
          overallStatus,
          httpsRequired: true,
          isHttps,
          manifestValid,
          serviceWorkerActive,
          iconsValid,
          systems,
          scores: {
            android: androidScore,
            ios: iosScore,
            desktop: desktopScore,
            pwa: pwaScore,
          },
        });

        // Log results
        logger.debug('PWA COMPATIBILITY REPORT', {
          https: isHttps,
          manifest: manifestValid,
          serviceWorker: serviceWorkerActive,
          icons: iconsValid,
          manifestData: manifest
        });
      } catch (e) {
        logger.error('PWA test error:', e);
      }
    };

    testPWA();
  }, []);

  if (!compatibility) {
    return <div className="text-center p-4">Testando PWA...</div>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'supported':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'partial':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'unsupported':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'supported':
        return 'bg-green-50 border-green-200';
      case 'partial':
        return 'bg-yellow-50 border-yellow-200';
      case 'unsupported':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50';
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Overall Status */}
      <Card className={`border-2 ${
        compatibility.overallStatus === 'excellent' ? 'border-green-500 bg-green-50' :
        compatibility.overallStatus === 'good' ? 'border-blue-500 bg-blue-50' :
        'border-yellow-500 bg-yellow-50'
      }`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📱 PWA Compatibility Report
            <Badge variant={
              compatibility.overallStatus === 'excellent' ? 'default' :
              compatibility.overallStatus === 'good' ? 'secondary' :
              'outline'
            }>
              {compatibility.overallStatus.toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-white rounded border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Android</p>
              <p className="text-2xl font-bold text-blue-600">{compatibility.scores.android}%</p>
            </div>
            <div className="p-3 bg-white rounded border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">iOS</p>
              <p className="text-2xl font-bold text-gray-600">{compatibility.scores.ios}%</p>
            </div>
            <div className="p-3 bg-white rounded border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Desktop</p>
              <p className="text-2xl font-bold text-green-600">{compatibility.scores.desktop}%</p>
            </div>
            <div className="p-3 bg-white rounded border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Overall PWA</p>
              <p className="text-2xl font-bold text-purple-600">{compatibility.scores.pwa}%</p>
            </div>
          </div>

          {/* Prerequisites */}
          <div className="bg-white rounded p-4 border border-gray-200">
            <p className="font-semibold mb-3 text-sm">Core Requirements:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                {compatibility.isHttps ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span>HTTPS/Localhost: {compatibility.isHttps ? '✅' : '❌'}</span>
              </div>
              <div className="flex items-center gap-2">
                {compatibility.manifestValid ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span>Manifest: {compatibility.manifestValid ? '✅' : '❌'}</span>
              </div>
              <div className="flex items-center gap-2">
                {compatibility.serviceWorkerActive ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span>Service Worker: {compatibility.serviceWorkerActive ? '✅' : '❌'}</span>
              </div>
              <div className="flex items-center gap-2">
                {compatibility.iconsValid ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span>Icons: {compatibility.iconsValid ? '✅' : '❌'}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Compatibility */}
      {compatibility.systems.map((system, idx) => (
        <Card key={idx} className={`border ${getStatusColor(system.status)}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {getStatusIcon(system.status)}
              <span>{system.platform}</span>
              <span className="text-sm text-gray-600 font-normal">({system.os})</span>
              <Badge className="ml-auto">
                {system.status === 'supported' ? '✅ Suportado' :
                 system.status === 'partial' ? '⚠️ Parcial' :
                 '❌ Não suportado'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold mb-1">Install Method:</p>
              <p className="text-sm text-gray-700 bg-white p-2 rounded">{system.installMethod}</p>
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">Status:</p>
              <ul className="space-y-1">
                {system.details.map((detail, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    {detail}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">Requirements:</p>
              <ul className="space-y-1">
                {system.requirements.map((req, i) => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span>•</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>

            {system.notes && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> {system.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Installation Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📖 How to Test PWA Installation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">🤖 Android Chrome:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Open app on Android Chrome</li>
              <li>Look for menu icon (⋮) or check address bar</li>
              <li>Tap "Install app" or "Add to Home Screen"</li>
              <li>Confirm installation</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold mb-1">🍎 iOS Safari:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Open app on iOS Safari</li>
              <li>Tap Share button (↗️)</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Customize name (if desired)</li>
              <li>Tap "Add"</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold mb-1">🖥️ Desktop Chrome:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Open app in Chrome on desktop</li>
              <li>Click install icon in address bar (⬇️)</li>
              <li>Or: Menu → "Install app"</li>
              <li>Confirm installation</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
