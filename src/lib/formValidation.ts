import { z } from 'zod';

/**
 * ✅ PRIORITY HIGH: Runtime validation schemas for critical forms
 * 
 * These schemas provide runtime validation to catch invalid data before
 * it reaches the database, improving data integrity and user experience.
 */

// ============================================================
// Transaction Form Validation
// ============================================================

export const transactionFormSchema = z.object({
  description: z
    .string()
    .min(1, 'Descrição é obrigatória')
    .max(200, 'Descrição muito longa (máximo 200 caracteres)')
    .trim(),
  
  amount: z
    .number()
    .positive('Valor deve ser positivo')
    .max(999999999, 'Valor muito alto')
    .multipleOf(0.01, 'Valor inválido'),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (formato YYYY-MM-DD)')
    .refine((date) => {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime());
    }, 'Data inválida'),
  
  type: z.enum(['income', 'expense', 'transfer'], {
    errorMap: () => ({ message: 'Tipo inválido' }),
  }),
  
  category_id: z
    .string()
    .uuid('ID de categoria inválido')
    .nullable(),
  
  account_id: z
    .string()
    .uuid('ID de conta inválido'),
  
  status: z.enum(['pending', 'completed'], {
    errorMap: () => ({ message: 'Status inválido' }),
  }),
  
  to_account_id: z
    .string()
    .uuid('ID de conta destino inválido')
    .optional(),
  
  invoice_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Mês da fatura inválido (formato YYYY-MM)')
    .optional(),
  
  installments: z
    .number()
    .int('Número de parcelas deve ser inteiro')
    .min(1, 'Mínimo 1 parcela')
    .max(120, 'Máximo 120 parcelas')
    .optional(),
  
  is_fixed: z.boolean().optional(),
  is_provision: z.boolean().optional(),
}).refine(
  (data) => {
    // Se é transferência, deve ter conta destino
    if (data.type === 'transfer') {
      return !!data.to_account_id;
    }
    return true;
  },
  {
    message: 'Transferências devem ter conta destino',
    path: ['to_account_id'],
  }
).refine(
  (data) => {
    // Se tem invoice_month, deve ser do tipo expense
    if (data.invoice_month) {
      return data.type === 'expense';
    }
    return true;
  },
  {
    message: 'Apenas despesas podem ter mês de fatura',
    path: ['invoice_month'],
  }
);

export type TransactionFormData = z.infer<typeof transactionFormSchema>;

// ============================================================
// Account Form Validation
// ============================================================

export const accountFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome muito longo (máximo 100 caracteres)')
    .trim(),
  
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'meal_voucher'], {
    errorMap: () => ({ message: 'Tipo de conta inválido' }),
  }),
  
  balance: z
    .number()
    .max(999999999, 'Saldo muito alto')
    .multipleOf(0.01, 'Saldo inválido')
    .optional()
    .default(0),
  
  initial_balance: z
    .number()
    .max(999999999, 'Saldo inicial muito alto')
    .multipleOf(0.01, 'Saldo inicial inválido')
    .optional(),
  
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (formato #RRGGBB)')
    .default('#6b7280'),
  
  limit_amount: z
    .number()
    .positive('Limite deve ser positivo')
    .max(999999999, 'Limite muito alto')
    .multipleOf(0.01, 'Limite inválido')
    .optional(),
  
  due_date: z
    .number()
    .int('Dia de vencimento deve ser inteiro')
    .min(1, 'Dia mínimo: 1')
    .max(31, 'Dia máximo: 31')
    .optional(),
  
  closing_date: z
    .number()
    .int('Dia de fechamento deve ser inteiro')
    .min(1, 'Dia mínimo: 1')
    .max(31, 'Dia máximo: 31')
    .optional(),
}).refine(
  (data) => {
    // Cartão de crédito deve ter limite
    if (data.type === 'credit') {
      return data.limit_amount !== undefined && data.limit_amount > 0;
    }
    return true;
  },
  {
    message: 'Cartão de crédito deve ter limite definido',
    path: ['limit_amount'],
  }
).refine(
  (data) => {
    // Cartão de crédito deve ter datas de fechamento e vencimento
    if (data.type === 'credit') {
      return data.closing_date !== undefined && data.due_date !== undefined;
    }
    return true;
  },
  {
    message: 'Cartão de crédito deve ter datas de fechamento e vencimento',
    path: ['closing_date'],
  }
);

export type AccountFormData = z.infer<typeof accountFormSchema>;

// ============================================================
// Category Form Validation
// ============================================================

export const categoryFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório')
    .max(50, 'Nome muito longo (máximo 50 caracteres)')
    .trim(),
  
  type: z.enum(['income', 'expense', 'both'], {
    errorMap: () => ({ message: 'Tipo de categoria inválido' }),
  }),
  
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (formato #RRGGBB)')
    .default('#6b7280'),
  
  icon: z
    .string()
    .max(50, 'Ícone muito longo')
    .optional(),
});

export type CategoryFormData = z.infer<typeof categoryFormSchema>;

// ============================================================
// Transfer Form Validation
// ============================================================

export const transferFormSchema = z.object({
  from_account_id: z
    .string()
    .uuid('ID de conta origem inválido'),
  
  to_account_id: z
    .string()
    .uuid('ID de conta destino inválido'),
  
  amount: z
    .number()
    .positive('Valor deve ser positivo')
    .max(999999999, 'Valor muito alto')
    .multipleOf(0.01, 'Valor inválido'),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (formato YYYY-MM-DD)')
    .refine((date) => {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime());
    }, 'Data inválida'),
  
  description: z
    .string()
    .max(200, 'Descrição muito longa')
    .optional(),
}).refine(
  (data) => data.from_account_id !== data.to_account_id,
  {
    message: 'Contas de origem e destino devem ser diferentes',
    path: ['to_account_id'],
  }
);

export type TransferFormData = z.infer<typeof transferFormSchema>;

// ============================================================
// Credit Payment Form Validation
// ============================================================

export const creditPaymentFormSchema = z.object({
  credit_account_id: z
    .string()
    .uuid('ID de conta crédito inválido'),
  
  debit_account_id: z
    .string()
    .uuid('ID de conta débito inválido'),
  
  amount: z
    .number()
    .positive('Valor deve ser positivo')
    .max(999999999, 'Valor muito alto')
    .multipleOf(0.01, 'Valor inválido'),
  
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (formato YYYY-MM-DD)')
    .refine((date) => {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime());
    }, 'Data inválida'),
}).refine(
  (data) => data.credit_account_id !== data.debit_account_id,
  {
    message: 'Contas de crédito e débito devem ser diferentes',
    path: ['debit_account_id'],
  }
);

export type CreditPaymentFormData = z.infer<typeof creditPaymentFormSchema>;

// ============================================================
// Helper function for safe form validation
// ============================================================

export function validateFormData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Format Zod errors for user-friendly display
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
}
