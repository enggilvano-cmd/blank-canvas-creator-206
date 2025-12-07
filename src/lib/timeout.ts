/**
 * Utilitário para adicionar timeout em promises
 * Previne requisições travadas indefinidamente
 */

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Envolve uma promise com timeout
 * @param promise - Promise a ser executada
 * @param timeoutMs - Tempo máximo em milissegundos
 * @param message - Mensagem de erro customizada
 * 
 * Uso:
 * ```tsx
 * try {
 *   const result = await withTimeout(
 *     fetch('/api/data'),
 *     5000,
 *     'Requisição demorou muito'
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error('Timeout!');
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = `Operation timed out after ${timeoutMs}ms`
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Wrapper para fetch com timeout
 * @param url - URL a requisitar
 * @param options - Opções fetch + timeoutMs
 * 
 * Uso:
 * ```tsx
 * const response = await fetchWithTimeout('/api/data', {
 *   method: 'GET',
 *   timeoutMs: 5000
 * });
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 10000, ...fetchOptions } = options;

  // Criar AbortController para cancel de requisição
  const controller = new AbortController();
  const signal = controller.signal;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Fetch timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
