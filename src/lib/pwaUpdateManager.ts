import { logger } from './logger';

interface PWAUpdateConfig {
  checkInterval?: number; // em ms, default: 1 hora
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  onUpdateApplied?: () => void;
  onUpdateError?: (error: Error) => void;
}

class PWAUpdateManager {
  private currentVersion: string = '';
  private sw: ServiceWorkerRegistration | null = null;
  private updateCheckInterval: ReturnType<typeof setInterval> | null = null;
  private config: PWAUpdateConfig = {
    checkInterval: 60 * 60 * 1000, // 1 hora
  };

  /**
   * Inicializa o gerenciador de atualizações do PWA
   */
  async init(registration: ServiceWorkerRegistration, config?: PWAUpdateConfig) {
    try {
      this.sw = registration;
      this.config = { ...this.config, ...config };
      
      // Obter versão atual do arquivo de versão
      await this.fetchCurrentVersion();
      
      logger.info(`[PWA] Versão atual: ${this.currentVersion}`);
      
      // Detectar mudanças no service worker
      this.sw.addEventListener('updatefound', () => {
        this.handleUpdateFound();
      });

      // Verificar atualizações periodicamente
      this.startPeriodicCheck();
      
      // Tentar verificar atualizações imediatamente
      // Tratamos erro aqui para não causar alertas desnecessários no startup (ex: offline)
      try {
        await this.checkForUpdates();
      } catch (checkError) {
        logger.warn('[PWA] Falha na verificação inicial de atualizações (provavelmente offline)', checkError);
      }
      
      logger.info('[PWA] Update manager inicializado');
    } catch (error) {
      // Erro fatal na inicialização do manager
      logger.error('[PWA] Erro ao inicializar update manager', error);
      // Só notificar erro se realmente for crítico e não apenas falha de rede na verificação
      if (error instanceof Error && error.message !== 'Failed to update') {
        this.config.onUpdateError?.(error as Error);
      }
    }
  }

  /**
   * Inicia verificação periódica de atualizações
   */
  private startPeriodicCheck() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        logger.error('[PWA] Erro ao verificar atualizações', error);
      });
    }, this.config.checkInterval);

    logger.info(
      `[PWA] Verificação periódica de atualizações iniciada (intervalo: ${this.config.checkInterval}ms)`
    );
  }

  /**
   * Verifica se há atualizações disponíveis
   */
  async checkForUpdates(): Promise<boolean> {
    if (!this.sw) {
      logger.warn('[PWA] Service Worker não registrado');
      return false;
    }

    try {
      logger.info('[PWA] Verificando atualizações...');
      const registration = await this.sw.update();
      
      if (registration.waiting) {
        logger.info('[PWA] Atualização pendente encontrada');
        return true;
      }

      logger.info('[PWA] Nenhuma atualização disponível');
      return false;
    } catch (error) {
      logger.error('[PWA] Erro ao verificar atualizações', error);
      throw error;
    }
  }

  /**
   * Obtém a versão atual do aplicativo
   */
  private async fetchCurrentVersion(): Promise<string> {
    try {
      // Tentar obter versão de um arquivo de versão no servidor
      const response = await fetch('/version.json', {
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        this.currentVersion = data.version || 'unknown';
        return this.currentVersion;
      }

      // Fallback: usar timestamp do build
      this.currentVersion = new Date().getTime().toString();
      return this.currentVersion;
    } catch (error) {
      logger.warn('[PWA] Não foi possível obter versão do servidor', error);
      this.currentVersion = 'unknown';
      return this.currentVersion;
    }
  }

  /**
   * Trata quando uma nova versão do service worker é encontrada
   */
  private handleUpdateFound() {
    logger.info('[PWA] Novo service worker encontrado');

    const newSW = this.sw?.installing;

    if (!newSW) return;

    newSW.addEventListener('statechange', () => {
      if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
        // Nova versão está pronta
        logger.info('[PWA] Nova versão do SW pronta para ativação');
        this.config.onUpdateAvailable?.(this.sw!);
      }
    });
  }

  /**
   * Aplica a atualização do PWA e limpa caches antigos
   */
  async applyUpdate(): Promise<void> {
    if (!this.sw) {
      throw new Error('Service Worker não registrado');
    }

    try {
      logger.info('[PWA] Iniciando atualização e limpeza de caches...');

      // 1. Limpar todos os caches
      await this.clearAllCaches();

      // 2. Limpar localStorage e sessionStorage (opcional)
      await this.clearStorages(false); // Mante dados do usuário por padrão

      // 3. Ativar novo service worker
      await this.activateNewSW();

      // 4. Recarregar página
      await this.reloadPage();

      logger.info('[PWA] Atualização aplicada com sucesso');
      this.config.onUpdateApplied?.();
    } catch (error) {
      logger.error('[PWA] Erro ao aplicar atualização', error);
      this.config.onUpdateError?.(error as Error);
      throw error;
    }
  }

  /**
   * Limpa todos os caches
   */
  private async clearAllCaches(): Promise<void> {
    try {
      const cacheNames = await caches.keys();
      logger.info(`[PWA] Limpando ${cacheNames.length} caches`);

      const deletePromises = cacheNames.map((cacheName) => {
        logger.info(`[PWA] Deletando cache: ${cacheName}`);
        return caches.delete(cacheName);
      });

      await Promise.all(deletePromises);
      logger.info('[PWA] Todos os caches foram limpos');
    } catch (error) {
      logger.error('[PWA] Erro ao limpar caches', error);
      throw error;
    }
  }

  /**
   * Limpa localStorage e/ou sessionStorage
   */
  private async clearStorages(clearUserData: boolean = false): Promise<void> {
    try {
      if (clearUserData) {
        // Limpar tudo
        localStorage.clear();
        sessionStorage.clear();
        logger.info('[PWA] localStorage e sessionStorage limpos');
      } else {
        // Limpar apenas dados de cache/temp
        const keysToDelete = Object.keys(localStorage).filter((key) => {
          // Manter dados críticos do usuário
          return !key.startsWith('user_') && !key.startsWith('auth_');
        });

        keysToDelete.forEach((key) => {
          localStorage.removeItem(key);
        });

        sessionStorage.clear();
        logger.info(`[PWA] ${keysToDelete.length} itens removidos de localStorage`);
      }
    } catch (error) {
      logger.error('[PWA] Erro ao limpar storages', error);
    }
  }

  /**
   * Ativa o novo service worker
   */
  private async activateNewSW(): Promise<void> {
    if (!this.sw) {
      throw new Error('Service Worker não registrado');
    }

    return new Promise((resolve, reject) => {
      const activeWorker = this.sw!.waiting || this.sw!.installing;

      if (!activeWorker) {
        logger.warn('[PWA] Nenhum novo SW para ativar');
        resolve();
        return;
      }

      activeWorker.addEventListener('statechange', function handler() {
        if (activeWorker!.state === 'activated') {
          activeWorker!.removeEventListener('statechange', handler);
          logger.info('[PWA] Novo service worker ativado');
          resolve();
        }
      });

      // Enviar mensagem para ativar o novo SW
      activeWorker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  /**
   * Recarrega a página
   */
  private async reloadPage(): Promise<void> {
    return new Promise((resolve) => {
      // Aguardar um pouco para garantir que o novo SW está ativo
      setTimeout(() => {
        logger.info('[PWA] Recarregando página');
        window.location.reload();
        resolve();
      }, 500);
    });
  }

  /**
   * Limpa o intervalo de verificação
   */
  destroy() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    logger.info('[PWA] Update manager destruído');
  }

  /**
   * Força reinstalação manual do PWA
   */
  async forceReinstall(): Promise<void> {
    try {
      logger.info('[PWA] Forçando reinstalação...');

      // Desregistrar todos os service workers
      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const registration of registrations) {
        const success = await registration.unregister();
        if (success) {
          logger.info('[PWA] Service Worker desregistrado');
        }
      }

      // Limpar caches
      await this.clearAllCaches();

      // Limpar storages
      await this.clearStorages(true);

      // Recarregar página
      logger.info('[PWA] Recarregando página após limpeza completa');
      window.location.reload();
    } catch (error) {
      logger.error('[PWA] Erro ao forçar reinstalação', error);
      this.config.onUpdateError?.(error as Error);
      throw error;
    }
  }

  /**
   * Obtém informações de status do PWA
   */
  getStatus() {
    return {
      isSupported: 'serviceWorker' in navigator,
      isRegistered: !!this.sw,
      currentVersion: this.currentVersion,
      hasWaitingSW: !!this.sw?.waiting,
    };
  }
}

// Singleton
export const pwaUpdateManager = new PWAUpdateManager();

export type { PWAUpdateConfig };
