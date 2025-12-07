/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// Financial limits
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000; // 1 billion cents = 10 million currency units
export const MIN_TRANSACTION_AMOUNT = 1; // 1 cent

// Date formats
export const DATE_FORMAT_DB = 'yyyy-MM-dd';
export const DATE_FORMAT_DISPLAY = 'dd/MM/yyyy';
export const DATE_FORMAT_INVOICE = 'yyyy-MM';

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 1000;

// Validation
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_ACCOUNT_NAME_LENGTH = 100;

// UUID regex for validation
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default values
export const DEFAULT_CREDIT_DUE_DATE = 10;
export const DEFAULT_CREDIT_CLOSING_DATE = 1;
