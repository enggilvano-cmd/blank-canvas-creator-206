/**
 * Cliente-side rate limiter simples
 * Previne múltiplos submits acidentais
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // em milissegundos
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
