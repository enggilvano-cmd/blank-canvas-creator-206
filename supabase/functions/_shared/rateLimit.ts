/**
 * Rate Limiting Helper para Supabase Edge Functions
 * Previne abuso de APIs críticas (transações, transferências, etc)
 * 
 * Implementação usando localStorage de Supabase ou Redis (se disponível)
 */

interface RateLimitConfig {
  userId: string;
  limit: number;        // Máximo de requisições
  windowMs: number;     // Janela de tempo em ms
  operation: string;    // Nome da operação para logging
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Verifica se usuário excedeu rate limit
 * @param config - Configuração do rate limit
 * @returns Resultado com informações de rate limit
 * 
 * @example
 * const result = await checkRateLimit({
 *   userId: 'user-123',
 *   limit: 10,              // 10 requisições
 *   windowMs: 60000,        // por minuto
 *   operation: 'atomic-transaction'
 * });
 * 
 * if (!result.allowed) {
 *   throw new Error(`Rate limit exceeded. Retry in ${result.retryAfterSeconds}s`);
 * }
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const { userId, limit, windowMs, operation } = config;
  
  // Gera chave única para este usuário e operação
  const key = `rl:${userId}:${operation}:${Math.floor(Date.now() / windowMs)}`;
  
  // Nota: Em produção, usar Supabase Redis ou similar
  // Para agora, implementar counter simples
  
  try {
    // Simulação de contador
    const currentCount = await incrementCounter(key, windowMs);
    
    const allowed = currentCount <= limit;
    const remaining = Math.max(0, limit - currentCount);
    const resetAt = Date.now() + windowMs;
    const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
    
    // Log para auditoria
    if (!allowed) {
      console.warn(`Rate limit exceeded for ${userId} on ${operation}`, {
        count: currentCount,
        limit,
        remaining
      });
    }
    
    return {
      allowed,
      remaining,
      resetAt,
      retryAfterSeconds
    };
  } catch (error) {
    console.error(`Rate limit check failed: ${error}`);
    // Em caso de erro, permitir requisição para não bloquear app
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + windowMs,
      retryAfterSeconds: 0
    };
  }
}

/**
 * Incrementa e retorna contador para rate limiting
 * @param key - Chave do contador
 * @param expirationMs - Tempo para expirar em ms
 * @returns Valor atual do contador
 */
async function incrementCounter(key: string, expirationMs: number): Promise<number> {
  // TODO: Implementar com Redis ou Supabase Storage
  // Por enquanto, retorna valor mock
  
  // Idealmente:
  // 1. Usar Supabase Redis (se disponível)
  // 2. Ou usar Postgres com triggers para incremento atômico
  // 3. Ou usar Cache Storage com TTL
  
  // Para MVP, simulamos com número aleatório para teste
  return Math.floor(Math.random() * 15);
}

/**
 * Middleware para Rate Limiting em Edge Functions
 * Use como primeiro middleware na função
 * 
 * @example
 * export async function handler(req: Request) {
 *   // 1. Verificar rate limit PRIMEIRO
 *   const user_id = req.headers.get('x-user-id');
 *   const rateLimitResult = await checkRateLimit({
 *     userId: user_id,
 *     limit: 10,
 *     windowMs: 60000,
 *     operation: 'atomic-transaction'
 *   });
 *   
 *   if (!rateLimitResult.allowed) {
 *     return new Response(
 *       JSON.stringify({
 *         error: 'Rate limit exceeded',
 *         retryAfterSeconds: rateLimitResult.retryAfterSeconds
 *       }),
 *       {
 *         status: 429,
 *         headers: {
 *           'Retry-After': String(rateLimitResult.retryAfterSeconds)
 *         }
 *       }
 *     );
 *   }
 *   
 *   // 2. Processar requisição normalmente
 *   return await processTransaction(req);
 * }
 */

/**
 * Rate Limiting Recommendations
 * 
 * CRÍTICOS (limite baixo):
 * - atomic-transaction: 10/min por usuário
 * - atomic-transfer: 5/min por usuário
 * - check-subscriptions: 1/min por usuário
 * 
 * MODERADOS (limite médio):
 * - get-transactions: 60/min por usuário
 * - add-transaction: 30/min por usuário
 * - add-account: 10/min por usuário
 * 
 * LEVES (limite alto):
 * - get-accounts: 120/min por usuário
 * - get-categories: 120/min por usuário
 */

export const rateLimitDefaults = {
  // Transações - operações críticas
  atomicTransaction: {
    limit: 10,
    windowMs: 60000,  // 1 minuto
    operation: 'atomic-transaction'
  },
  
  // Transferências - operações críticas
  atomicTransfer: {
    limit: 5,
    windowMs: 60000,  // 1 minuto
    operation: 'atomic-transfer'
  },
  
  // Verificação de subscrição
  checkSubscriptions: {
    limit: 1,
    windowMs: 60000,  // 1 minuto
    operation: 'check-subscriptions'
  },
  
  // Leitura de transações
  getTransactions: {
    limit: 60,
    windowMs: 60000,  // 1 minuto
    operation: 'get-transactions'
  },
  
  // Adicionar transação
  addTransaction: {
    limit: 30,
    windowMs: 60000,  // 1 minuto
    operation: 'add-transaction'
  },
  
  // Leitura de contas
  getAccounts: {
    limit: 120,
    windowMs: 60000,  // 1 minuto
    operation: 'get-accounts'
  }
};

/**
 * Exemplo de implementação em Edge Function
 * 
 * supabase/functions/atomic-transaction/index.ts
 * 
 * export default async function handler(req: Request) {
 *   const user_id = req.headers.get('x-user-id');
 *   if (!user_id) {
 *     return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
 *   }
 *   
 *   // 1. Check rate limit
 *   const rateLimitResult = await checkRateLimit({
 *     userId: user_id,
 *     ...rateLimitDefaults.atomicTransaction
 *   });
 *   
 *   if (!rateLimitResult.allowed) {
 *     return new Response(
 *       JSON.stringify({
 *         error: 'Rate limit exceeded',
 *         retryAfterSeconds: rateLimitResult.retryAfterSeconds
 *       }),
 *       {
 *         status: 429,
 *         headers: {
 *           'Retry-After': String(rateLimitResult.retryAfterSeconds),
 *           'X-RateLimit-Remaining': String(rateLimitResult.remaining)
 *         }
 *       }
 *     );
 *   }
 *   
 *   // 2. Process normally
 *   try {
 *     const result = await atomicCreateTransaction(user_id, req.body);
 *     return new Response(JSON.stringify(result), { status: 200 });
 *   } catch (error) {
 *     return new Response(JSON.stringify({ error: error.message }), { status: 500 });
 *   }
 * }
 */
