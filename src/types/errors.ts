/**
 * Type-safe error handling utilities
 * Replaces 'any' types in catch blocks across the application
 */

export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface AuthError extends SupabaseError {
  status?: number;
}

export type AppError = Error | SupabaseError | AuthError;

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Extract error message safely from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (hasMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Check if error is a Supabase error
 */
export function isSupabaseError(error: unknown): error is SupabaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'details' in error || 'hint' in error)
  );
}

/**
 * Check if error is an Auth error
 */
export function isAuthError(error: unknown): error is AuthError {
  return isSupabaseError(error) && 'status' in error;
}
