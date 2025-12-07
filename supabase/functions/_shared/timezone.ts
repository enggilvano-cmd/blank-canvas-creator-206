import { toZonedTime, formatInTimeZone } from 'https://esm.sh/date-fns-tz@3.2.0';
import { format } from 'https://esm.sh/date-fns@3.6.0';

/**
 * Sistema de timezone para Edge Functions
 * Garante que operações de data considerem o timezone do usuário
 */

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Obtém o timezone do usuário ou retorna o padrão
 */
export const getUserTimezone = (): string => {
  return DEFAULT_TIMEZONE;
};

/**
 * Obtém a data/hora atual no timezone do usuário
 */
export const getNowInUserTimezone = (timezone?: string): Date => {
  const tz = timezone || getUserTimezone();
  return toZonedTime(new Date(), tz);
};

/**
 * Formata uma data no timezone do usuário
 */
export const formatInUserTimezone = (
  date: Date | string,
  formatStr: string,
  timezone?: string
): string => {
  const tz = timezone || getUserTimezone();
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, tz, formatStr);
};

/**
 * Obtém a data de hoje como string YYYY-MM-DD no timezone do usuário
 */
export const getTodayInUserTimezone = (timezone?: string): string => {
  const tz = timezone || getUserTimezone();
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
};

/**
 * Converte uma data para o timezone do usuário
 */
export const toUserTimezone = (date: Date | string, timezone?: string): Date => {
  const tz = timezone || getUserTimezone();
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, tz);
};

/**
 * Cria uma nova data no timezone do usuário
 */
export const createDateInUserTimezone = (
  year: number,
  month: number,
  day: number,
  timezone?: string
): Date => {
  const tz = timezone || getUserTimezone();
  const date = new Date(year, month, day, 0, 0, 0, 0);
  return toZonedTime(date, tz);
};

/**
 * Formata uma data como YYYY-MM-DD no timezone do usuário
 */
export const formatDateString = (date: Date, timezone?: string): string => {
  const tz = timezone || getUserTimezone();
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
};

/**
 * Adiciona dias a uma data mantendo o timezone
 */
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Adiciona meses a uma data mantendo o timezone
 */
export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

/**
 * Adiciona anos a uma data mantendo o timezone
 */
export const addYears = (date: Date, years: number): Date => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
};

/**
 * Define a hora de uma data no timezone do usuário
 */
export const setTimeInUserTimezone = (
  date: Date,
  hours: number,
  minutes: number = 0,
  seconds: number = 0,
  milliseconds: number = 0
): Date => {
  const result = new Date(date);
  result.setHours(hours, minutes, seconds, milliseconds);
  return result;
};
