/**
 * BroadcastChannel para sincronização entre abas/windows
 * Sincroniza autenticação, logout e dados de usuário
 */

import { logger } from './logger';

export type BroadcastChannelMessage = 
  | { type: 'auth-change'; data: { userId: string | null; sessionId: string | null } }
  | { type: 'logout'; data: {} }
  | { type: 'theme-change'; data: { theme: string } }
  | { type: 'settings-change'; data: Record<string, unknown> };

/**
 * Gerenciador de sincronização entre abas
 * Uso:
 * ```tsx
 * const sync = new TabSynchronizer();
 * 
 * // Em um aba: usuário faz logout
 * sync.broadcast('logout', {});
 * 
 * // Em outra aba: listener recebe e pode atualizar estado
 * sync.subscribe('logout', () => {
 *   clearAuthData();
 * });
 * ```
 */
export class TabSynchronizer {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<(data: Record<string, unknown>) => void>> = new Map();
  private isSupported: boolean;

  constructor() {
    // Verificar suporte a BroadcastChannel
    this.isSupported = typeof BroadcastChannel !== 'undefined';
    
    if (this.isSupported) {
      try {
        this.channel = new BroadcastChannel('planiflow-sync');
        this.channel.onmessage = (event) => {
          const { type, data } = event.data as BroadcastChannelMessage;
          this.notifyListeners(type, data);
        };
      } catch (error) {
        logger.warn('BroadcastChannel not available:', error);
        this.isSupported = false;
      }
    }
  }

  /**
   * Inscrever em eventos
   */
  subscribe(eventType: string, callback: (data: Record<string, unknown>) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(callback);

    // Retornar função para desinscrever
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Transmitir evento para outras abas
   */
  broadcast(eventType: string, data: Record<string, unknown>): void {
    if (!this.isSupported || !this.channel) {
      logger.warn('BroadcastChannel not available, cannot broadcast');
      return;
    }

    this.channel.postMessage({ type: eventType, data });
  }

  /**
   * Notificar listeners locais
   */
  private notifyListeners(eventType: string, data: Record<string, unknown>): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in listener for event "${eventType}":`, error);
        }
      });
    }
  }

  /**
   * Limpar recursos
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

// Instância singleton
let instance: TabSynchronizer | null = null;

/**
 * Hook para usar sincronizador
 * Uso:
 * ```tsx
 * const sync = getTabSynchronizer();
 * 
 * useEffect(() => {
 *   const unsubscribe = sync.subscribe('logout', handleLogout);
 *   return unsubscribe;
 * }, []);
 * ```
 */
export function getTabSynchronizer(): TabSynchronizer {
  if (!instance) {
    instance = new TabSynchronizer();
  }
  return instance;
}
