/**
 * Rate Limiter distribuído usando Upstash Redis
 * Funciona corretamente em ambientes serverless
 */

interface RateLimitConfig {
  windowMs: number; // Janela de tempo em ms
  maxRequests: number; // Máximo de requests por janela
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Rate Limiter baseado em Redis/Upstash
 * Usa INCR com EXPIRE para implementar sliding window simplificado
 */
export class UpstashRateLimiter {
  private config: RateLimitConfig;
  private redisUrl: string;
  private redisToken: string;

  constructor(config: RateLimitConfig) {
    this.config = config;
    
    // Variáveis de ambiente para Upstash Redis
    // Remove quotes if they exist (handles cases where secrets are stored with quotes)
    const rawUrl = Deno.env.get('UPSTASH_REDIS_REST_URL') || '';
    const rawToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '';
    
    this.redisUrl = rawUrl.replace(/^["']|["']$/g, '');
    this.redisToken = rawToken.replace(/^["']|["']$/g, '');
  }

  /**
   * Verifica se o request está dentro do limite
   * @param identifier - Identificador único (user_id, IP, etc)
   */
  async check(identifier: string): Promise<RateLimitResult> {
    // Se Redis não está configurado, permitir (fallback graceful)
    if (!this.redisUrl || !this.redisToken) {
      console.warn('Upstash Redis not configured, rate limiting disabled');
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: Date.now() + this.config.windowMs,
      };
    }

    const now = Date.now();
    const windowSeconds = Math.ceil(this.config.windowMs / 1000);
    const key = `ratelimit:${identifier}:${Math.floor(now / this.config.windowMs)}`;

    try {
      // Pipeline Redis: INCR + EXPIRE
      const response = await fetch(`${this.redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, windowSeconds],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Redis error: ${response.status}`);
      }

      const results = await response.json();
      const count = results[0].result as number;

      const resetAt = now + this.config.windowMs;
      const remaining = Math.max(0, this.config.maxRequests - count);

      return {
        allowed: count <= this.config.maxRequests,
        remaining,
        resetAt,
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Em caso de erro, permitir (fail-open)
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: now + this.config.windowMs,
      };
    }
  }

  /**
   * Middleware para aplicar rate limiting
   */
  async middleware(req: Request, identifier: string): Promise<Response | null> {
    const result = await this.check(identifier);

    if (!result.allowed) {
      const resetDate = new Date(result.resetAt);
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          resetAt: resetDate.toISOString(),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': this.config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetAt.toString(),
            'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    return null;
  }
}

// Configurações pré-definidas com Upstash
export const upstashRateLimiters = {
  // Rate limiter estrito para operações sensíveis
  strict: new UpstashRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: 10,
  }),
  
  // Rate limiter moderado para operações normais
  moderate: new UpstashRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: 100,
  }),
  
  // Rate limiter leniente para leituras
  lenient: new UpstashRateLimiter({
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 60,
  }),
};
