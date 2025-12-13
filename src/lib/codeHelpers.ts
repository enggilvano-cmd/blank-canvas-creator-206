/**
 * 🧹 UTILITÁRIOS DE LIMPEZA DE CÓDIGO
 * 
 * Helpers para eliminar código duplicado e melhorar reusabilidade
 */

import type { Account, Category } from '@/types';

// ==========================================
// LOOKUP HELPERS (evita código duplicado)
// ==========================================

/**
 * Busca nome de conta por ID com fallback
 */
export function getAccountName(
  accountId: string,
  accounts: Account[] | Map<string, Account>,
  fallback: string = 'Conta Desconhecida'
): string {
  if (accounts instanceof Map) {
    return accounts.get(accountId)?.name ?? fallback;
  }
  return accounts.find(a => a.id === accountId)?.name ?? fallback;
}

/**
 * Busca nome de categoria por ID com fallback
 */
export function getCategoryName(
  categoryId: string | null,
  categories: Category[] | Map<string, Category>,
  fallback: string = '-'
): string {
  if (!categoryId) return fallback;
  
  if (categories instanceof Map) {
    return categories.get(categoryId)?.name ?? fallback;
  }
  return categories.find(c => c.id === categoryId)?.name ?? fallback;
}

/**
 * Busca cor de conta por ID
 */
export function getAccountColor(
  accountId: string,
  accounts: Account[] | Map<string, Account>,
  fallback: string = '#6b7280'
): string {
  if (accounts instanceof Map) {
    return accounts.get(accountId)?.color ?? fallback;
  }
  return accounts.find(a => a.id === accountId)?.color ?? fallback;
}

/**
 * Busca cor de categoria por ID
 */
export function getCategoryColor(
  categoryId: string | null,
  categories: Category[] | Map<string, Category>,
  fallback: string = '#6b7280'
): string {
  if (!categoryId) return fallback;
  
  if (categories instanceof Map) {
    return categories.get(categoryId)?.color ?? fallback;
  }
  return categories.find(c => c.id === categoryId)?.color ?? fallback;
}

// ==========================================
// ARRAY HELPERS (operações comuns)
// ==========================================

/**
 * Agrupa array por função de chave
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<K, T[]>);
}

/**
 * Remove duplicatas de array baseado em chave
 */
export function uniqueBy<T, K>(
  array: T[],
  keyFn: (item: T) => K
): T[] {
  const seen = new Set<K>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ordena array por múltiplas chaves
 */
export function sortBy<T>(
  array: T[],
  ...keys: Array<(item: T) => any>
): T[] {
  return [...array].sort((a, b) => {
    for (const keyFn of keys) {
      const aVal = keyFn(a);
      const bVal = keyFn(b);
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  });
}

/**
 * Particiona array em dois baseado em predicado
 */
export function partition<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  
  for (const item of array) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  
  return [pass, fail];
}

/**
 * Chunking de array em pedaços menores
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ==========================================
// OBJECT HELPERS
// ==========================================

/**
 * Pick apenas propriedades específicas
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit propriedades específicas
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Merge profundo de objetos (imutável)
 */
export function deepMerge<T extends object>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;
  
  const result = { ...target };
  
  for (const source of sources) {
    for (const key in source) {
      const targetValue = result[key];
      const sourceValue = source[key];
      
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object'
      ) {
        result[key] = deepMerge(targetValue as any, sourceValue as any);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as any;
      }
    }
  }
  
  return result;
}

// ==========================================
// STRING HELPERS
// ==========================================

/**
 * Capitaliza primeira letra
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Trunca string com elipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}

/**
 * Remove acentos de string
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza string para busca (lowercase, sem acentos)
 */
export function normalizeForSearch(str: string): string {
  return removeAccents(str.toLowerCase().trim());
}

// ==========================================
// NUMBER HELPERS
// ==========================================

/**
 * Clamp valor entre min e max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Arredonda para número de casas decimais
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Verifica se número está em range (inclusive)
 */
export function inRange(
  value: number,
  min: number,
  max: number
): boolean {
  return value >= min && value <= max;
}

/**
 * Soma array de números com precisão
 */
export function sumPrecise(numbers: number[]): number {
  // Converte para inteiros para evitar erros de ponto flutuante
  const factor = 100; // Assumindo 2 casas decimais
  const sum = numbers.reduce((acc, num) => acc + Math.round(num * factor), 0);
  return sum / factor;
}

// ==========================================
// DATE HELPERS (complementares)
// ==========================================

/**
 * Verifica se data é hoje
 */
export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

/**
 * Verifica se data é este mês
 */
export function isThisMonth(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  return d.getMonth() === now.getMonth() && 
         d.getFullYear() === now.getFullYear();
}

/**
 * Calcula diferença em dias
 */
export function daysDifference(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==========================================
// CONDITIONAL HELPERS (evita if/else duplicado)
// ==========================================

/**
 * Retorna valor baseado em condição (ternário nomeado)
 */
export function when<T>(
  condition: boolean,
  trueValue: T,
  falseValue: T
): T {
  return condition ? trueValue : falseValue;
}

/**
 * Retorna valor ou fallback se null/undefined
 */
export function defaultTo<T>(
  value: T | null | undefined,
  defaultValue: T
): T {
  return value ?? defaultValue;
}

/**
 * Switch case funcional
 */
export function match<T, R>(
  value: T,
  cases: Record<string, R>,
  defaultCase?: R
): R | undefined {
  const key = String(value);
  return key in cases ? cases[key] : defaultCase;
}

// ==========================================
// ASYNC HELPERS
// ==========================================

/**
 * Sleep assíncrono
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry com backoff exponencial
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await sleep(initialDelay * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Timeout para promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error('Operation timed out')
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(timeoutError), timeoutMs)
    ),
  ]);
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

/**
 * Verifica se valor é vazio (null, undefined, string vazia, array vazio)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Verifica se todos os valores são truthy
 */
export function allTruthy(...values: unknown[]): boolean {
  return values.every(Boolean);
}

/**
 * Verifica se algum valor é truthy
 */
export function someTruthy(...values: unknown[]): boolean {
  return values.some(Boolean);
}
