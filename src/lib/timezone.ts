import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Sistema robusto de manipulação de timezone
 * Garante consistência em todas as operações de data na aplicação
 */

// Timezone padrão do sistema (pode ser configurado por usuário no futuro)
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Obtém o timezone do usuário ou retorna o padrão
 */
export const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

/**
 * Converte uma data para o timezone do usuário
 */
export const toUserTimezone = (date: Date | string, timezone?: string): Date => {
  const tz = timezone || getUserTimezone();
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(dateObj, tz);
};

/**
 * Converte uma data do timezone do usuário para UTC
 */
export const fromUserTimezone = (date: Date | string, timezone?: string): Date => {
  const tz = timezone || getUserTimezone();
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return fromZonedTime(dateObj, tz);
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
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, tz, formatStr, { locale: ptBR });
};

/**
 * Normaliza uma data de input do formulário para YYYY-MM-DD em UTC
 * Garante que a data seja interpretada como meia-noite no timezone local
 */
export const normalizeFormDate = (dateInput: Date | string): string => {
  if (typeof dateInput === 'string') {
    // Se já é string no formato YYYY-MM-DD, retorna como está
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    // Parse ISO string
    const date = parseISO(dateInput);
    return format(date, 'yyyy-MM-dd');
  }
  
  // Para Date object, formata como YYYY-MM-DD
  return format(dateInput, 'yyyy-MM-dd');
};

/**
 * Converte string YYYY-MM-DD para Date no timezone do usuário
 */
export const parseDateString = (dateStr: string, timezone?: string): Date => {
  const tz = timezone || getUserTimezone();
  // Cria Date object assumindo meia-noite no timezone especificado
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return toZonedTime(date, tz);
};

/**
 * Obtém a data de hoje como string YYYY-MM-DD no timezone do usuário
 */
export const getTodayInUserTimezone = (timezone?: string): string => {
  const tz = timezone || getUserTimezone();
  const now = new Date();
  return formatInTimeZone(now, tz, 'yyyy-MM-dd');
};

/**
 * Compara duas datas ignorando hora/minuto/segundo
 */
export const isSameDay = (date1: Date | string, date2: Date | string): boolean => {
  const d1 = normalizeFormDate(date1);
  const d2 = normalizeFormDate(date2);
  return d1 === d2;
};

/**
 * Adiciona dias a uma data mantendo o timezone
 */
export const addDaysInUserTimezone = (
  date: Date | string,
  days: number,
  timezone?: string
): Date => {
  const tz = timezone || getUserTimezone();
  const dateObj = typeof date === 'string' ? parseDateString(date, tz) : date;
  const newDate = new Date(dateObj);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
};

/**
 * Verifica se uma data está dentro de um período
 */
export const isDateInRange = (
  date: Date | string,
  startDate: Date | string,
  endDate: Date | string
): boolean => {
  const d = normalizeFormDate(date);
  const start = normalizeFormDate(startDate);
  const end = normalizeFormDate(endDate);
  return d >= start && d <= end;
};

/**
 * ✅ BUG FIX #12: UTC helpers for consistent server sync
 * Obtém data atual em UTC para sync com servidor
 */
export const getNowUTC = (): Date => {
  return new Date();
};

/**
 * ✅ BUG FIX #12: Calcula cutoff date em UTC para sync
 * Usado em operações de sincronização com servidor
 */
export const getMonthsAgoUTC = (months: number): string => {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff.toISOString().split('T')[0];
};

/**
 * ✅ BUG FIX #12: Formata data UTC como YYYY-MM-DD
 */
export const formatUTCDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};
