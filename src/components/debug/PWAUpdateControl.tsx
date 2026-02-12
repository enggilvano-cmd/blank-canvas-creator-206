import { Button } from '@/components/ui/button';
import { usePWAUpdate } from '@/hooks/usePWAUpdate';
import { AlertCircle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

/**
 * Componente de exemplo mostrando como usar o hook usePWAUpdate
 * para criar uma interface customizada de gerenciamento de atualizações do PWA
 * 
 * @example
 * ```tsx
 * // Adicionar a um dashboard ou settings page
 * import { PWAUpdateControl } from '@/components/debug/PWAUpdateControl';
 * 
 * export function SettingsPage() {
 *   return (
 *     <div>
 *       <PWAUpdateControl />
 *     </div>
 *   );
 * }
 * ```
 */
export function PWAUpdateControl() {
  const {
    status,
    isChecking,
    isUpdating,
    checkForUpdates,
    applyUpdate,
    forceReinstall,
    error,
  } = usePWAUpdate();

  if (!status.isSupported) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Service Workers não suportados</AlertTitle>
        <AlertDescription>
          Seu navegador não suporta Service Workers (PWA).
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div>
        <h3 className="font-semibold mb-2">Gerenciamento de Atualizações PWA</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={status.isRegistered ? 'text-green-600' : 'text-red-600'}>
              {status.isRegistered ? '✓ Ativo' : '✗ Inativo'}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span>Versão Atual:</span>
            <span className="font-mono">{status.currentVersion}</span>
          </div>
          
          <div className="flex justify-between">
            <span>Atualização Pendente:</span>
            <span className={status.hasWaitingSW ? 'text-orange-600' : 'text-gray-500'}>
              {status.hasWaitingSW ? '◆ Sim' : '○ Não'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={checkForUpdates}
          disabled={isChecking || isUpdating}
          variant="outline"
          size="sm"
        >
          {isChecking ? 'Verificando...' : 'Verificar Atualizações'}
        </Button>

        <Button
          onClick={applyUpdate}
          disabled={isUpdating || isChecking}
          size="sm"
        >
          {isUpdating ? 'Atualizando...' : 'Aplicar Atualização'}
        </Button>

        <Button
          onClick={forceReinstall}
          disabled={isUpdating || isChecking}
          variant="destructive"
          size="sm"
        >
          {isUpdating ? 'Reinstalando...' : 'Forçar Reinstalação'}
        </Button>
      </div>

      <div className="text-xs text-gray-500 mt-4 p-2 bg-gray-50 rounded">
        <p>
          💡 <strong>Tip:</strong> Use o console do navegador para mais controle:
        </p>
        <code className="block mt-1 font-mono">
          await window.forceReinstallPWA()
        </code>
        <code className="block font-mono">
          window.pwaStatus()
        </code>
      </div>
    </div>
  );
}

/**
 * Componente simplificado que apenas mostra o status
 * Útil para debug/analytics
 */
export function PWAUpdateStatus() {
  const { status } = usePWAUpdate();

  return (
    <div className="text-xs text-gray-600">
      <span>PWA: {status.isRegistered ? '✓' : '✗'}</span>
      <span className="ml-2">v{status.currentVersion}</span>
      {status.hasWaitingSW && <span className="ml-2 text-orange-600">⬆ Atualização disponível</span>}
    </div>
  );
}
