/**
 * Validação centralizada usando Zod para Edge Functions
 */

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ============= Schemas Zod Completos =============

// Tipos básicos reutilizáveis (exportados para uso em outros módulos)
export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
export const invoiceMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Invoice month must be in YYYY-MM format')
  .nullable()
  .optional();

// ============= Transaction Schemas =============

export const TransactionInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description must be less than 200 characters'),
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount exceeds maximum allowed value'),
  date: dateSchema,
  type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Type must be either income or expense' }) }),
  category_id: uuidSchema.nullable().optional(),
  account_id: uuidSchema,
  status: z.enum(['pending', 'completed'], { errorMap: () => ({ message: 'Status must be either pending or completed' }) }),
  invoice_month: invoiceMonthSchema,
  invoice_month_overridden: z.boolean().optional(),
});

export const RecurringTransactionInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description must be less than 200 characters'),
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount exceeds maximum allowed value'),
  date: dateSchema,
  type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Type must be either income or expense' }) }),
  category_id: uuidSchema.nullable().optional(),
  account_id: uuidSchema,
  status: z.enum(['pending', 'completed'], { errorMap: () => ({ message: 'Status must be either pending or completed' }) }),
  recurrence_type: z.enum(['daily', 'weekly', 'monthly', 'yearly'], { errorMap: () => ({ message: 'Recurrence type must be daily, weekly, monthly, or yearly' }) }),
  recurrence_end_date: dateSchema.optional(),
});

export const FixedTransactionInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description must be less than 200 characters'),
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount exceeds maximum allowed value'),
  date: dateSchema,
  type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Type must be either income or expense' }) }),
  category_id: uuidSchema.nullable().optional(),
  account_id: uuidSchema,
  status: z.enum(['pending', 'completed'], { errorMap: () => ({ message: 'Status must be either pending or completed' }) }),
  is_provision: z.boolean().optional(),
});

export const EditTransactionInputSchema = z.object({
  transaction_id: uuidSchema,
  updates: z.object({
    description: z.string().trim().min(1).max(200).optional(),
    amount: z.number().positive().max(1_000_000_000).optional(),
    date: dateSchema.optional(),
    type: z.enum(['income', 'expense']).optional(),
    category_id: uuidSchema.optional(),
    account_id: uuidSchema.optional(),
    status: z.enum(['pending', 'completed']).optional(),
    invoice_month: z.string().regex(/^\d{4}-\d{2}$/, 'Invoice month must be in YYYY-MM format').nullable().optional(),
    invoice_month_overridden: z.boolean().optional(),
  }),
  scope: z.enum(['current', 'current-and-remaining', 'all']).optional(),
});

export const DeleteTransactionInputSchema = z.object({
  transaction_id: uuidSchema,
  scope: z.enum(['current', 'current-and-remaining', 'all']).optional(),
});

export const TransferInputSchema = z.object({
  from_account_id: uuidSchema,
  to_account_id: uuidSchema,
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount exceeds maximum allowed value'),
  outgoing_description: z.string().trim().max(200, 'Description must be less than 200 characters').optional(),
  incoming_description: z.string().trim().max(200, 'Description must be less than 200 characters').optional(),
  date: dateSchema,
  status: z.enum(['pending', 'completed']),
}).refine(data => data.from_account_id !== data.to_account_id, {
  message: 'Source and destination accounts must be different',
  path: ['to_account_id'],
});

export const PayBillInputSchema = z.object({
  credit_account_id: uuidSchema,
  debit_account_id: uuidSchema,
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount exceeds maximum allowed value'),
  payment_date: dateSchema,
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description must be less than 200 characters').optional(),
}).refine(data => data.credit_account_id !== data.debit_account_id, {
  message: 'Credit and debit accounts must be different',
  path: ['debit_account_id'],
});

// ============= Admin Schemas =============

export const DeleteUserInputSchema = z.object({
  userId: uuidSchema,
});

// ============= Test Data Schemas =============

export const GenerateTestDataInputSchema = z.object({
  transactionCount: z.number().int().min(1).max(50000).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  clearExisting: z.boolean().optional(),
});

// ============= Legacy Support (mantido para compatibilidade) =============

// Tipos básicos
export const legacyUuidSchema = {
  parse: (value: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error('Invalid UUID format');
    }
    return value;
  }
};

export const legacyDateSchema = {
  parse: (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    return value;
  }
};

export const stringSchema = (options?: { min?: number; max?: number; trim?: boolean }) => ({
  parse: (value: string) => {
    let str = value;
    if (options?.trim !== false) {
      str = str.trim();
    }
    if (options?.min && str.length < options.min) {
      throw new Error(`String must be at least ${options.min} characters`);
    }
    if (options?.max && str.length > options.max) {
      throw new Error(`String must be less than ${options.max} characters`);
    }
    return str;
  }
});

export const numberSchema = (options?: { min?: number; max?: number; positive?: boolean }) => ({
  parse: (value: number) => {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      throw new Error('Must be a valid number');
    }
    if (options?.positive && value <= 0) {
      throw new Error('Must be a positive number');
    }
    if (options?.min !== undefined && value < options.min) {
      throw new Error(`Must be greater than or equal to ${options.min}`);
    }
    if (options?.max !== undefined && value > options.max) {
      throw new Error(`Must be less than or equal to ${options.max}`);
    }
    return value;
  }
});

export const enumSchema = <T extends string>(values: readonly T[]) => ({
  parse: (value: string): T => {
    if (!values.includes(value as T)) {
      throw new Error(`Must be one of: ${values.join(', ')}`);
    }
    return value as T;
  }
});

// Schemas para transações
export const transactionSchema = {
  description: stringSchema({ min: 1, max: 200 }),
  amount: numberSchema({ positive: true, max: 1_000_000_000 }),
  date: legacyDateSchema,
  type: enumSchema(['income', 'expense'] as const),
  status: enumSchema(['pending', 'completed'] as const),
  account_id: legacyUuidSchema,
  category_id: legacyUuidSchema,
  to_account_id: legacyUuidSchema, // opcional
  invoice_month: {
    parse: (value?: string) => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}$/.test(value)) {
        throw new Error('Invoice month must be in YYYY-MM format');
      }
      return value;
    }
  }
};

// Validação de objeto completo
export function validateTransaction(data: Record<string, unknown>) {
  const errors: Record<string, string> = {};

  try {
    transactionSchema.description.parse(data.description as string);
  } catch (e) {
    errors.description = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.amount.parse(data.amount as number);
  } catch (e) {
    errors.amount = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.date.parse(data.date as string);
  } catch (e) {
    errors.date = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.type.parse(data.type as string);
  } catch (e) {
    errors.type = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.status.parse(data.status as string);
  } catch (e) {
    errors.status = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.account_id.parse(data.account_id as string);
  } catch (e) {
    errors.account_id = e instanceof Error ? e.message : 'Validation failed';
  }

  try {
    transactionSchema.category_id.parse(data.category_id as string);
  } catch (e) {
    errors.category_id = e instanceof Error ? e.message : 'Validation failed';
  }

  if (data.invoice_month) {
    try {
      transactionSchema.invoice_month.parse(data.invoice_month as string);
    } catch (e) {
      errors.invoice_month = e instanceof Error ? e.message : 'Validation failed';
    }
  }

  if (data.to_account_id) {
    try {
      transactionSchema.to_account_id.parse(data.to_account_id as string);
    } catch (e) {
      errors.to_account_id = e instanceof Error ? e.message : 'Validation failed';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

// ============= Validation Helpers =============

/**
 * Valida dados usando um schema Zod e retorna resultado estruturado
 */
export function validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors: Record<string, string> = {};
  result.error.issues.forEach(issue => {
    const path = issue.path.join('.');
    errors[path] = issue.message;
  });
  
  return { success: false, errors };
}

/**
 * Helper para resposta de erro de validação
 */
export function validationErrorResponse(errors: Record<string, string>, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: 'Validation failed',
      details: errors
    }),
    {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
