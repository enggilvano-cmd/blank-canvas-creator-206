import { logger } from './logger';

/**
 * Cliente-side rate limiter simples
 * Previne múltiplos submits acidentais
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // em milissegundos
}

interface TokenBucketConfig {
  maxTokens: number;
  refillRate: number; // tokens por segundo
  minDelay: number; // ms entre operações
}

class RateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { maxRequests: 1, windowMs: 1000 }) {
    this.config = config;
  }

  /**
   * Verifica se está dentro do limite
   */
  isAllowed(): boolean {
    const now = Date.now();
    
    // Remover requisições fora da janela de tempo
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.config.windowMs
    );

    // Se dentro do limite, adicionar e retornar true
    if (this.requests.length < this.config.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Tempo até próxima requisição ser permitida (em ms)
   */
  getTimeUntilNextRequest(): number {
    if (this.requests.length === 0) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    const timeUntilReset = this.config.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, timeUntilReset);
  }

  /**
   * Reset manual
   */
  reset(): void {
    this.requests = [];
  }
}

/**
 * Token Bucket Rate Limiter para operações de sync
 * Mais eficiente para operações em lote
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  private isProcessing = false;

  constructor(private config: TokenBucketConfig) {
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refillTokens();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const resolve = this.queue.shift();
        if (resolve) resolve();

        if (this.config.minDelay > 0 && this.queue.length > 0) {
          await new Promise(r => setTimeout(r, this.config.minDelay));
        }
      } else {
        const timeUntilRefill = 1000 / this.config.refillRate;
        await new Promise(r => setTimeout(r, timeUntilRefill));
      }
    }

    this.isProcessing = false;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getStats(): { availableTokens: number; queueLength: number; isProcessing: boolean } {
    this.refillTokens();
    return {
      availableTokens: Math.floor(this.tokens),
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
    this.queue = [];
    this.isProcessing = false;
  }
}

/**
 * Rate Limiter pré-configurado para sync offline
 */
export const offlineSyncRateLimiter = new TokenBucketRateLimiter({
  maxTokens: 20,
  refillRate: 5,
  minDelay: 100,
});

/**
 * Helper para executar operação com rate limiting
 */
export async function withRateLimit<T>(
  rateLimiter: TokenBucketRateLimiter,
  operation: () => Promise<T>
): Promise<T> {
  await rateLimiter.waitForSlot();
  
  try {
    return await operation();
  } catch (error) {
    logger.error('Rate-limited operation failed:', error);
    throw error;
  }
}

/**
 * Hook para rate limiting com debounce automático
 * Uso:
 * ```tsx
 * const [isSubmitting, setIsSubmitting] = useState(false);
 * const limiter = useRateLimiter({ maxRequests: 1, windowMs: 2000 });
 *
 * const handleSubmit = async () => {
 *   if (!limiter.isAllowed()) {
 *     toast.error('Aguarde antes de enviar novamente');
 *     return;
 *   }
 *
 *   setIsSubmitting(true);
 *   try {
 *     await submitForm();
 *   } finally {
 *     setIsSubmitting(false);
 *   }
 * };
 * ```
 */
export function useRateLimiter(config?: RateLimitConfig) {
  return new RateLimiter(config);
}

export { RateLimiter };
