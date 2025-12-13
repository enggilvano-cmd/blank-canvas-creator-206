import { logger } from './logger';

/**
 * SafeJSON - Wrapper seguro para JSON.parse e JSON.stringify
 * 
 * Previne crashes da aplicação devido a:
 * - JSON.parse com dados corrompidos
 * - JSON.parse com dados não-JSON
 * - JSON.stringify com circular references
 * - JSON.stringify com valores inválidos
 */

/**
 * Faz parse seguro de JSON string
 * Retorna null se o parse falhar ao invés de lançar exceção
 */
export function safeJSONParse<T>(text: string, fallback: T | null = null): T | null {
  if (!text || typeof text !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    logger.error('SafeJSON.parse error:', error);
    return fallback;
  }
}

/**
 * Faz stringify seguro de um objeto
 * Retorna null se o stringify falhar ao invés de lançar exceção
 * 
 * Trata automaticamente:
 * - Circular references
 * - BigInt values
 * - Undefined values
 */
export function safeJSONStringify(
  value: unknown,
  fallback: string | null = null,
  pretty = false
): string | null {
  if (value === undefined) {
    return fallback;
  }

  try {
    const seen = new WeakSet();
    
    const replacer = (_key: string, val: unknown) => {
      // Handle BigInt
      if (typeof val === 'bigint') {
        return val.toString();
      }
      
      // Handle circular references
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular Reference]';
        }
        seen.add(val);
      }
      
      return val;
    };

    return JSON.stringify(value, replacer, pretty ? 2 : undefined);
  } catch (error) {
    logger.error('SafeJSON.stringify error:', error);
    return fallback;
  }
}

/**
 * Verifica se uma string é um JSON válido
 */
export function isValidJSON(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse com validação de schema (usando zod)
 * Útil para validar dados de APIs ou localStorage
 */
export function safeJSONParseWithValidation<T>(
  text: string,
  validator: (data: unknown) => data is T
): T | null {
  const parsed = safeJSONParse<unknown>(text);
  
  if (!parsed) {
    return null;
  }

  if (!validator(parsed)) {
    logger.error('SafeJSON.parseWithValidation: validation failed');
    return null;
  }

  return parsed;
}

/**
 * Clone profundo seguro de um objeto
 * Usa JSON.parse(JSON.stringify()) mas com error handling
 */
export function safeDeepClone<T>(obj: T): T | null {
  const serialized = safeJSONStringify(obj);
  if (!serialized) {
    return null;
  }
  return safeJSONParse<T>(serialized);
}
