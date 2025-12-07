/**
 * Rate Limiter para Edge Functions
 * Implementa rate limiting usando um Map em memória
 * Para produção, considere usar Redis ou Upstash
 */

interface RateLimitConfig {
  windowMs: number; // Janela de tempo em ms
  maxRequests: number; // Máximo de requests por janela
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Store in-memory (para produção, use Redis/Upstash)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpar entradas antigas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Verifica se o request está dentro do limite
   * @param identifier - Identificador único (user_id, IP, etc)
   * @returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const key = `${identifier}`;
    
    let entry = rateLimitStore.get(key);

    // Se não existe ou expirou, criar nova entrada
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 1,
        resetAt: now + this.config.windowMs,
      };
      rateLimitStore.set(key, entry);
      
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: entry.resetAt,
      };
    }

    // Incrementar contador
    entry.count++;

    // Verificar se excedeu o limite
    if (entry.count > this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Middleware para aplicar rate limiting
   */
  middleware(req: Request, identifier: string): Response | null {
    const result = this.check(identifier);

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

// Usar rate limiter baseado em Upstash Redis (distribuído, funciona em serverless)
// Fallback graceful para in-memory se Redis não configurado
import { upstashRateLimiters } from './upstash-rate-limiter.ts';

// Exportar configurações
export const rateLimiters = upstashRateLimiters;
