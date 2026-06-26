/**
 * Sistema de Logger Condicional
 * 
 * Exibe logs apenas em ambiente de desenvolvimento
 * Em produção, reporta erros críticos ao Sentry
 * Suporta níveis: info, warn, error, debug, success
 */

import * as Sentry from '@sentry/react';

const isDevelopment = import.meta.env.DEV;

class Logger {
  private static instance: Logger;
  private enabled: boolean;

  private constructor() {
    this.enabled = isDevelopment;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log de informação geral (apenas desenvolvimento)
   */
  public info(message: string, ...args: unknown[]): void {
    if (!this.enabled) {return;}
    console.log(`ℹ️ [INFO] ${message}`, ...args);
  }

  /**
   * Log de aviso (desenvolvimento + Sentry em produção)
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.enabled) {
      console.warn(`⚠️ [WARN] ${message}`, ...args);
    }
    
    // Em produção, captura warnings no Sentry
    if (!isDevelopment) {
      Sentry.captureMessage(message, {
        level: 'warning',
        extra: { args },
      });
    }
  }

  /**
   * Log de erro (desenvolvimento + Sentry em produção)
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.enabled) {
      console.error(`❌ [ERROR] ${message}`, ...args);
    }
    
    // Em produção, captura erros no Sentry
    if (!isDevelopment) {
      const error = args[0] instanceof Error ? args[0] : new Error(message);
      Sentry.captureException(error, {
        extra: {
          message,
          additionalData: args.slice(1),
        },
      });
    }
  }

  /**
   * Log de debug (detalhes técnicos - apenas desenvolvimento)
   */
  public debug(message: string, ...args: unknown[]): void {
    if (!this.enabled) {return;}
    console.debug(`🔍 [DEBUG] ${message}`, ...args);
  }

  /**
   * Log de sucesso (operações bem-sucedidas - apenas desenvolvimento)
   */
  public success(message: string, ...args: unknown[]): void {
    if (!this.enabled) {return;}
    console.log(`✅ [SUCCESS] ${message}`, ...args);
  }

  /**
   * Log de grupo (para agrupar logs relacionados - apenas desenvolvimento)
   */
  public group(label: string): void {
    if (!this.enabled) {return;}
    console.group(label);
  }

  public groupEnd(): void {
    if (!this.enabled) {return;}
    console.groupEnd();
  }

  /**
   * Log de tempo (para medir performance - apenas desenvolvimento)
   */
  public time(label: string): void {
    if (!this.enabled) {return;}
    console.time(label);
  }

  public timeEnd(label: string): void {
    if (!this.enabled) {return;}
    console.timeEnd(label);
  }

  /**
   * Habilita/desabilita logs manualmente (útil para testes)
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Verifica se os logs estão habilitados
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

// Exporta instância singleton
export const logger = Logger.getInstance();

// Exporta também como default para flexibilidade
export default logger;
