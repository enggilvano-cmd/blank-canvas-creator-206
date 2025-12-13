/**
 * 📏 CONSTANTES DO SISTEMA
 * 
 * Centraliza todos os "magic numbers" e strings hardcoded
 * para facilitar manutenção e configuração.
 */

// ==========================================
// FINANCIAL LIMITS & DEFAULTS
// ==========================================

export const FINANCIAL = {
  /** Valor máximo para transação (centavos) */
  MAX_TRANSACTION_AMOUNT: 1_000_000_000, // 1 bilhão de centavos = 10 milhões
  
  /** Valor mínimo para transação (centavos) */
  MIN_TRANSACTION_AMOUNT: 1, // 1 centavo
  
  /** Dia padrão de vencimento de cartão de crédito */
  DEFAULT_CREDIT_DUE_DATE: 10,
  
  /** Dia padrão de fechamento de cartão de crédito */
  DEFAULT_CREDIT_CLOSING_DATE: 1,
  
  /** Moeda padrão */
  DEFAULT_CURRENCY: 'BRL',
  
  /** Símbolo da moeda */
  CURRENCY_SYMBOL: 'R$',
  
  /** Número de casas decimais para moeda */
  CURRENCY_DECIMALS: 2,
} as const;

// ==========================================
// DATE FORMATS
// ==========================================

export const DATE_FORMAT = {
  /** Formato para banco de dados (ISO) */
  DB: 'yyyy-MM-dd',
  
  /** Formato para exibição ao usuário */
  DISPLAY: 'dd/MM/yyyy',
  
  /** Formato para mês de fatura */
  INVOICE: 'yyyy-MM',
  
  /** Formato completo com hora */
  DATETIME: 'dd/MM/yyyy HH:mm:ss',
} as const;

// Legacy exports (backward compatibility)
export const DATE_FORMAT_DB = DATE_FORMAT.DB;
export const DATE_FORMAT_DISPLAY = DATE_FORMAT.DISPLAY;
export const DATE_FORMAT_INVOICE = DATE_FORMAT.INVOICE;

// ==========================================
// PAGINATION
// ==========================================

export const PAGINATION = {
  /** Itens por página (padrão) */
  DEFAULT_PAGE_SIZE: 50,
  
  /** Máximo de itens por página */
  MAX_PAGE_SIZE: 1000,
  
  /** Opções de itens por página */
  PAGE_SIZE_OPTIONS: [25, 50, 100, 200, 500, 1000] as const,
} as const;

// Legacy exports
export const DEFAULT_PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;
export const MAX_PAGE_SIZE = PAGINATION.MAX_PAGE_SIZE;

// ==========================================
// VALIDATION LIMITS
// ==========================================

export const VALIDATION = {
  /** Tamanho máximo de descrição */
  MAX_DESCRIPTION_LENGTH: 200,
  
  /** Tamanho máximo de nome de categoria */
  MAX_CATEGORY_NAME_LENGTH: 100,
  
  /** Tamanho máximo de nome de conta */
  MAX_ACCOUNT_NAME_LENGTH: 100,
  
  /** Tamanho mínimo de senha */
  MIN_PASSWORD_LENGTH: 6,
  
  /** Número máximo de parcelas */
  MAX_INSTALLMENTS: 999,
  
  /** Regex para UUID */
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  
  /** Regex para email */
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

// Legacy exports
export const MAX_DESCRIPTION_LENGTH = VALIDATION.MAX_DESCRIPTION_LENGTH;
export const MAX_CATEGORY_NAME_LENGTH = VALIDATION.MAX_CATEGORY_NAME_LENGTH;
export const MAX_ACCOUNT_NAME_LENGTH = VALIDATION.MAX_ACCOUNT_NAME_LENGTH;
export const UUID_REGEX = VALIDATION.UUID_REGEX;
export const DEFAULT_CREDIT_DUE_DATE = FINANCIAL.DEFAULT_CREDIT_DUE_DATE;
export const DEFAULT_CREDIT_CLOSING_DATE = FINANCIAL.DEFAULT_CREDIT_CLOSING_DATE;
export const MAX_TRANSACTION_AMOUNT = FINANCIAL.MAX_TRANSACTION_AMOUNT;
export const MIN_TRANSACTION_AMOUNT = FINANCIAL.MIN_TRANSACTION_AMOUNT;

// ==========================================
// PERFORMANCE & CACHE
// ==========================================

export const PERFORMANCE = {
  /** Delay padrão para debounce (ms) */
  DEBOUNCE_DELAY: 300,
  
  /** Delay padrão para throttle (ms) */
  THROTTLE_DELAY: 200,
  
  /** Threshold para lista grande */
  LARGE_LIST_THRESHOLD: 500,
  
  /** Threshold para lista média */
  MEDIUM_LIST_THRESHOLD: 50,
} as const;

export const CACHE = {
  /** Tempo de cache para dados voláteis (ms) */
  STALE_TIME_HIGH: 1 * 60 * 1000, // 1 minuto
  
  /** Tempo de cache para dados normais (ms) */
  STALE_TIME_MEDIUM: 5 * 60 * 1000, // 5 minutos
  
  /** Tempo de cache para dados estáticos (ms) */
  STALE_TIME_LOW: 15 * 60 * 1000, // 15 minutos
  
  /** Tempo até garbage collection (ms) */
  GC_TIME: 10 * 60 * 1000, // 10 minutos
} as const;

// ==========================================
// STORAGE
// ==========================================

export const STORAGE = {
  /** Versão do IndexedDB */
  DB_VERSION: 3,
  
  /** Nome do banco de dados offline */
  DB_NAME: 'planiflow-offline',
  
  /** Limite de localStorage (bytes) */
  LOCAL_STORAGE_LIMIT: 4 * 1024 * 1024, // 4MB
  
  /** Percentual máximo de uso */
  MAX_USAGE_PERCENT: 80,
  
  /** Retenção de transações (meses) */
  RETENTION_MONTHS: 12,
} as const;

// ==========================================
// RETRY & RATE LIMITING
// ==========================================

export const RETRY = {
  /** Número máximo de tentativas */
  MAX_ATTEMPTS: 3,
  
  /** Delay inicial entre retries (ms) */
  INITIAL_DELAY: 1000,
  
  /** Multiplicador para backoff exponencial */
  BACKOFF_MULTIPLIER: 2,
  
  /** Delay máximo (ms) */
  MAX_DELAY: 30000,
} as const;

export const RATE_LIMIT = {
  /** Tokens máximos para sync */
  MAX_TOKENS: 20,
  
  /** Taxa de refill (ops/segundo) */
  REFILL_RATE: 5,
  
  /** Delay mínimo (ms) */
  MIN_DELAY: 100,
  
  /** Tamanho máximo do batch */
  MAX_BATCH_SIZE: 1000,
} as const;

// ==========================================
// TIMEOUTS
// ==========================================

export const TIMEOUT = {
  /** Timeout para API (ms) */
  API_REQUEST: 30000,
  
  /** Timeout para sync offline (ms) */
  OFFLINE_SYNC: 60000,
  
  /** Timeout para operações de DB (ms) */
  DATABASE_OPERATION: 10000,
  
  /** Duração de toast de sucesso (ms) */
  TOAST_SUCCESS: 3000,
  
  /** Duração de toast de erro (ms) */
  TOAST_ERROR: 5000,
} as const;

// ==========================================
// UI CONSTANTS
// ==========================================

export const UI = {
  /** Largura da sidebar (px) */
  SIDEBAR_WIDTH: 280,
  
  /** Largura da sidebar colapsada (px) */
  SIDEBAR_WIDTH_COLLAPSED: 80,
  
  /** Breakpoints responsivos (px) */
  BREAKPOINT: {
    mobile: 768,
    tablet: 1024,
    desktop: 1280,
  },
  
  /** Z-indexes */
  Z_INDEX: {
    modal: 1000,
    tooltip: 2000,
    toast: 3000,
  },
} as const;

// ==========================================
// FEATURE FLAGS
// ==========================================

export const FEATURES = {
  /** Habilitar PWA */
  ENABLE_PWA: true,
  
  /** Habilitar modo offline */
  ENABLE_OFFLINE: true,
  
  /** Habilitar notificações push */
  ENABLE_PUSH_NOTIFICATIONS: true,
  
  /** Modo debug */
  DEBUG_MODE: import.meta.env.DEV,
} as const;

// ==========================================
// TYPE HELPERS
// ==========================================

/** Type helper para extrair valores de const objects */
export type ValueOf<T> = T[keyof T];

/** Type para opções de paginação */
export type PageSizeOption = typeof PAGINATION.PAGE_SIZE_OPTIONS[number];

