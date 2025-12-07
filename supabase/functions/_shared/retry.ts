/**
 * Retry helper with exponential backoff for Edge Functions
 * Automatically retries operations on transient failures (timeouts, deadlocks, 5xx errors)
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

interface ErrorWithProps {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Checks if an error is retryable (transient failure)
 */
function isRetryableError(error: unknown): boolean {
  const err = error as ErrorWithProps;
  
  // Network timeouts
  if (err?.message?.toLowerCase().includes('timeout')) {
    return true;
  }
  
  // Database deadlocks
  if (err?.code === '40P01' || err?.message?.toLowerCase().includes('deadlock')) {
    return true;
  }
  
  // PostgreSQL serialization failures
  if (err?.code === '40001') {
    return true;
  }
  
  // HTTP 5xx errors
  if (err?.status && err.status >= 500 && err.status < 600) {
    return true;
  }
  
  // Supabase connection errors
  if (err?.message?.toLowerCase().includes('connection')) {
    return true;
  }
  
  return false;
}

/**
 * Executes a function with retry logic and exponential backoff
 * 
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * 
 * @example
 * const result = await withRetry(async () => {
 *   return await supabase.from('table').insert(data);
 * });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a retryable error
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // Don't retry if we've exhausted our attempts
      if (attempt === opts.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      
        const err = error as ErrorWithProps;
        console.log(`Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delayMs}ms due to:`, err?.message || error);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}
