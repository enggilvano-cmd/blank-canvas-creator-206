/**
 * Constantes globais da aplicação
 * 
 * ✅ BUGFIX #19: Substituir magic numbers por constantes nomeadas
 * para melhorar legibilidade e manutenibilidade do código
 */

// ==========================================
// CONVERSÃO DE MOEDA
// ==========================================

/**
 * Número de centavos em 1 real
 * Usado para conversões entre centavos (integer) e reais (decimal)
 */
export const CENTS_PER_REAL = 100;

/**
 * Converte valor em reais para centavos
 * @param reais - Valor em reais (decimal)
 * @returns Valor em centavos (integer)
 * @example REAIS_TO_CENTS(10.50) // 1050
 */
export const REAIS_TO_CENTS = (reais: number): number => Math.round(reais * CENTS_PER_REAL);

/**
 * Converte valor em centavos para reais
 * @param cents - Valor em centavos (integer)
 * @returns Valor em reais (decimal)
 * @example CENTS_TO_REAIS(1050) // 10.50
 */
export const CENTS_TO_REAIS = (cents: number): number => cents / CENTS_PER_REAL;

// ==========================================
// TEMPO E DURAÇÃO
// ==========================================

/** Milissegundos em 1 segundo */
export const MILLISECONDS_PER_SECOND = 1000;

/** Segundos em 1 minuto */
export const SECONDS_PER_MINUTE = 60;

/** Minutos em 1 hora */
export const MINUTES_PER_HOUR = 60;

/** Horas em 1 dia */
export const HOURS_PER_DAY = 24;

/** Dias em 1 semana */
export const DAYS_PER_WEEK = 7;

/** Meses em 1 ano */
export const MONTHS_PER_YEAR = 12;

// Conversões compostas
export const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
export const MILLISECONDS_PER_HOUR = MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;
export const MILLISECONDS_PER_DAY = HOURS_PER_DAY * MILLISECONDS_PER_HOUR;

// ==========================================
// TIMEOUTS E DELAYS
// ==========================================

/**
 * Timeouts para operações de sincronização
 */
export const SYNC_TIMEOUTS = {
  /** Sincronização rápida (30 segundos) */
  QUICK: 30 * MILLISECONDS_PER_SECOND,
  
  /** Sincronização completa (2 minutos) */
  FULL: 2 * MILLISECONDS_PER_MINUTE,
  
  /** Importação de dados (5 minutos) */
  IMPORT: 5 * MILLISECONDS_PER_MINUTE,
  
  /** Exportação de dados (3 minutos) */
  EXPORT: 3 * MILLISECONDS_PER_MINUTE,
  
  /** Query individual (10 segundos) */
  QUERY: 10 * MILLISECONDS_PER_SECOND,
  
  /** Lock de operação (1 minuto) */
  OPERATION_LOCK: 1 * MILLISECONDS_PER_MINUTE,
} as const;

/**
 * Delays para debounce e throttle
 */
export const DELAYS = {
  /** Debounce para input de busca (300ms) */
  SEARCH_INPUT: 300,
  
  /** Debounce para auto-save (1 segundo) */
  AUTO_SAVE: 1 * MILLISECONDS_PER_SECOND,
  
  /** Throttle para scroll events (100ms) */
  SCROLL: 100,
  
  /** Throttle para resize events (200ms) */
  RESIZE: 200,
} as const;

// ==========================================
// CACHE E STORAGE
// ==========================================

/**
 * Tempos de cache (stale time) para React Query
 */
export const CACHE_TIMES = {
  /** Dados de curta duração (30 segundos) */
  SHORT: 30 * MILLISECONDS_PER_SECOND,
  
  /** Dados de média duração (2 minutos) */
  MEDIUM: 2 * MILLISECONDS_PER_MINUTE,
  
  /** Dados de longa duração (5 minutos) */
  LONG: 5 * MILLISECONDS_PER_MINUTE,
  
  /** Dados estáticos (1 hora) */
  STATIC: 1 * MILLISECONDS_PER_HOUR,
} as const;

/**
 * Limites de armazenamento
 */
export const STORAGE_LIMITS = {
  /** Uso máximo de storage (80%) */
  MAX_USAGE_PERCENT: 80,
  
  /** Idade máxima de dados offline (6 meses em dias) */
  MAX_OFFLINE_DATA_AGE_DAYS: 180,
  
  /** Número máximo de transações em cache */
  MAX_CACHED_TRANSACTIONS: 10000,
} as const;

// ==========================================
// CIRCUIT BREAKER
// ==========================================

/**
 * Configurações do Circuit Breaker
 */
export const CIRCUIT_BREAKER = {
  /** Número de falhas antes de abrir o circuito */
  FAILURE_THRESHOLD: 5,
  
  /** Tempo que o circuito fica aberto (30 segundos) */
  OPEN_DURATION: 30 * MILLISECONDS_PER_SECOND,
  
  /** Tempo de reset após sucesso (5 minutos) */
  RESET_TIMEOUT: 5 * MILLISECONDS_PER_MINUTE,
} as const;

// ==========================================
// PAGINAÇÃO E LIMITES
// ==========================================

/**
 * Limites de paginação e listagem
 */
export const PAGINATION = {
  /** Itens por página padrão */
  DEFAULT_PAGE_SIZE: 50,
  
  /** Itens por página para mobile */
  MOBILE_PAGE_SIZE: 20,
  
  /** Máximo de itens por página */
  MAX_PAGE_SIZE: 100,
  
  /** Número de páginas para pré-carregar */
  PREFETCH_PAGES: 1,
} as const;

// ==========================================
// VALIDAÇÃO
// ==========================================

/**
 * Limites de validação
 */
export const VALIDATION_LIMITS = {
  /** Número mínimo de parcelas */
  MIN_INSTALLMENTS: 2,
  
  /** Número máximo de parcelas */
  MAX_INSTALLMENTS: 360,
  
  /** Comprimento mínimo de descrição */
  MIN_DESCRIPTION_LENGTH: 1,
  
  /** Comprimento máximo de descrição */
  MAX_DESCRIPTION_LENGTH: 255,
  
  /** Valor mínimo de transação (em centavos) */
  MIN_TRANSACTION_AMOUNT: 1,
  
  /** Valor máximo de transação (em centavos) - 1 bilhão */
  MAX_TRANSACTION_AMOUNT: 100000000000,
} as const;

// ==========================================
// FORMATAÇÃO
// ==========================================

/**
 * Formatos de data
 */
export const DATE_FORMATS = {
  /** Formato ISO (YYYY-MM-DD) */
  ISO: 'yyyy-MM-dd',
  
  /** Formato brasileiro (DD/MM/YYYY) */
  BR: 'dd/MM/yyyy',
  
  /** Formato com hora (DD/MM/YYYY HH:mm) */
  BR_WITH_TIME: 'dd/MM/yyyy HH:mm',
  
  /** Formato de mês/ano (MM/YYYY) */
  MONTH_YEAR: 'MM/yyyy',
  
  /** Formato de mês por extenso (MMMM de YYYY) */
  MONTH_YEAR_LONG: "MMMM 'de' yyyy",
} as const;

/**
 * Precisão de números
 */
export const PRECISION = {
  /** Casas decimais para moeda */
  CURRENCY: 2,
  
  /** Casas decimais para porcentagem */
  PERCENTAGE: 2,
  
  /** Casas decimais para taxas */
  RATE: 4,
} as const;

// ==========================================
// HTTP E REDE
// ==========================================

/**
 * Códigos de status HTTP
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Configurações de retry
 */
export const RETRY_CONFIG = {
  /** Número máximo de tentativas */
  MAX_ATTEMPTS: 3,
  
  /** Delay inicial entre tentativas (1 segundo) */
  INITIAL_DELAY: 1 * MILLISECONDS_PER_SECOND,
  
  /** Multiplicador de backoff exponencial */
  BACKOFF_MULTIPLIER: 2,
  
  /** Delay máximo entre tentativas (30 segundos) */
  MAX_DELAY: 30 * MILLISECONDS_PER_SECOND,
} as const;

// ==========================================
// UI E UX
// ==========================================

/**
 * Breakpoints responsivos (em pixels)
 */
export const BREAKPOINTS = {
  /** Mobile pequeno */
  XS: 320,
  
  /** Mobile */
  SM: 640,
  
  /** Tablet */
  MD: 768,
  
  /** Desktop pequeno */
  LG: 1024,
  
  /** Desktop */
  XL: 1280,
  
  /** Desktop grande */
  XXL: 1536,
} as const;

/**
 * Durações de animação (em milissegundos)
 */
export const ANIMATION_DURATION = {
  /** Animação rápida */
  FAST: 150,
  
  /** Animação normal */
  NORMAL: 300,
  
  /** Animação lenta */
  SLOW: 500,
} as const;

/**
 * Z-index layers
 */
export const Z_INDEX = {
  /** Conteúdo base */
  BASE: 0,
  
  /** Dropdown */
  DROPDOWN: 1000,
  
  /** Sticky header */
  STICKY: 1020,
  
  /** Modal backdrop */
  MODAL_BACKDROP: 1040,
  
  /** Modal */
  MODAL: 1050,
  
  /** Popover */
  POPOVER: 1060,
  
  /** Tooltip */
  TOOLTIP: 1070,
  
  /** Toast/Notification */
  TOAST: 1080,
} as const;
