import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ✅ BUG FIX #21: API Documentation with JSDoc
 * 
 * @description Health check endpoint para monitoramento do sistema
 * @endpoint GET /functions/v1/health
 * @authentication Não requer autenticação
 * 
 * @response 200 OK - Sistema saudável
 * {
 *   status: 'healthy';
 *   timestamp: string;          // ISO 8601 timestamp
 *   checks: {
 *     database: {
 *       status: 'up';
 *       latency_ms: number;     // Latência em ms
 *     };
 *     cache: {
 *       status: 'available';
 *     };
 *     api: {
 *       status: 'operational';
 *       version: string;
 *     };
 *   };
 *   uptime_seconds: number;     // Tempo de uptime em segundos
 * }
 * 
 * @response 503 Service Unavailable - Sistema degradado ou não saudável
 * {
 *   status: 'degraded' | 'unhealthy';
 *   timestamp: string;
 *   checks: {
 *     database?: { status: 'down', error: string };
 *     cache?: { status: 'unavailable', error: string };
 *   };
 *   uptime_seconds: number;
 * }
 * 
 * @monitoring
 * - Use este endpoint com UptimeRobot, Datadog, ou similar
 * - Intervalo recomendado: 1-5 minutos
 * - Alerte se status != 'healthy' por mais de 2 minutos
 * 
 * @example
 * ```bash
 * curl https://your-project.supabase.co/functions/v1/health
 * ```
 * 
 * @example UptimeRobot Configuration
 * ```
 * Monitor Type: HTTP(s)
 * URL: https://your-project.supabase.co/functions/v1/health
 * Monitoring Interval: 5 minutes
 * Alert When: Response contains '"status":"unhealthy"' OR Status Code is not 200
 * ```
 */

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      latency_ms?: number;
      error?: string;
    };
    cache: {
      status: 'available' | 'unavailable';
      error?: string;
    };
    api: {
      status: 'operational' | 'error';
      version: string;
    };
  };
  uptime_seconds: number;
}

const startTime = Date.now();

/**
 * Health check endpoint
 * Verifica estado do banco de dados, cache e API
 * Retorna 200 se saudável, 503 se degradado/não saudável
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const timestamp = new Date().toISOString();
    const uptime_seconds = Math.floor((Date.now() - startTime) / 1000);

    // Initialize health check response
    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp,
      checks: {
        database: { status: 'down' },
        cache: { status: 'unavailable' },
        api: { status: 'operational', version: '1.0.0' },
      },
      uptime_seconds,
    };

    // Check database connection
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const dbStartTime = performance.now();
      const { data, error } = await supabase
        .from('accounts')
        .select('id')
        .limit(1)
        .timeout(5000); // 5s timeout

      const dbLatency = Math.round(performance.now() - dbStartTime);

      if (error) {
        healthCheck.checks.database = {
          status: 'down',
          error: error.message,
        };
        healthCheck.status = 'unhealthy';
      } else {
        healthCheck.checks.database = {
          status: 'up',
          latency_ms: dbLatency,
        };
      }
    } catch (dbError) {
      healthCheck.checks.database = {
        status: 'down',
        error: dbError instanceof Error ? dbError.message : 'Unknown database error',
      };
      healthCheck.status = 'unhealthy';
    }

    // Check cache availability (Supabase tem cache automático via PostgREST)
    try {
      // Verificar se conseguimos fazer queries simples (indica cache ativo)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error: cacheError } = await supabase
        .from('system_settings')
        .select('key')
        .limit(1)
        .timeout(2000);

      if (cacheError) {
        healthCheck.checks.cache = {
          status: 'unavailable',
          error: cacheError.message,
        };
        // Cache é nice-to-have, não marca como unhealthy
        if (healthCheck.status === 'healthy') {
          healthCheck.status = 'degraded';
        }
      } else {
        healthCheck.checks.cache = {
          status: 'available',
        };
      }
    } catch (cacheError) {
      healthCheck.checks.cache = {
        status: 'unavailable',
        error: cacheError instanceof Error ? cacheError.message : 'Unknown cache error',
      };
      if (healthCheck.status === 'healthy') {
        healthCheck.status = 'degraded';
      }
    }

    // Determinar status HTTP baseado na saúde
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;

    return new Response(JSON.stringify(healthCheck, null, 2), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    // Erro crítico no próprio health check
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 503,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
