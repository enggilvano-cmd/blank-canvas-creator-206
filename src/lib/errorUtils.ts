/**
 * Type guard para erros com mensagem
 */
interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

/**
 * Verifica se é instância de Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Extrai stack trace de forma segura
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  if (typeof error === 'object' && error !== null && 'stack' in error) {
    const stack = (error as any).stack;
    return typeof stack === 'string' ? stack : undefined;
  }
  return undefined;
}

/**
 * Type-safe error handler
 */
export function handleError(error: unknown) {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    isError: isError(error),
    originalError: error
  };
}

/**
 * Verifica se erro é de rede
 */
export function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('request') ||
    message.includes('cors') ||
    message.includes('timeout')
  );
}

/**
 * Verifica se erro é de autenticação
 */
export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('auth') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('session')
  );
}
