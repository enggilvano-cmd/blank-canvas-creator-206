import { z } from "zod";
import { MAX_DESCRIPTION_LENGTH, MAX_TRANSACTION_AMOUNT } from "./constants";

// ============= Account Schemas =============

export const addAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "O nome é obrigatório" })
    .max(100, { message: "O nome deve ter no máximo 100 caracteres" }),
  
  type: z.enum(["checking", "savings", "credit", "investment", "meal_voucher"], {
    required_error: "Selecione o tipo da conta",
    invalid_type_error: "Tipo de conta inválido",
  }),
  
  limitInCents: z
    .number({ invalid_type_error: "O limite deve ser um número" })
    .min(0, { message: "O limite não pode ser negativo" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O limite não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    })
    .optional(),
  
  dueDate: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 31;
    }, { message: "A data de vencimento deve estar entre 1 e 31" }),
  
  closingDate: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 31;
    }, { message: "A data de fechamento deve estar entre 1 e 31" }),
  
  color: z.string().regex(/^#[0-9A-F]{6}$/i, { message: "Cor inválida" }),
}).refine((data) => {
  // Validação: se é cartão de crédito, limite e datas são obrigatórios
  if (data.type === "credit") {
    return data.limitInCents && data.limitInCents > 0 && data.dueDate && data.closingDate;
  }
  return true;
}, {
  message: "Cartões de crédito requerem limite, data de fechamento e data de vencimento",
  path: ["type"],
});

export type AddAccountFormData = z.infer<typeof addAccountSchema>;

export const editAccountSchema = z.object({
  id: z.string().uuid({ message: "ID da conta inválido" }),
  name: z
    .string()
    .trim()
    .min(1, { message: "O nome é obrigatório" })
    .max(100, { message: "O nome deve ter no máximo 100 caracteres" }),
  
  type: z.enum(["checking", "savings", "credit", "investment", "meal_voucher"], {
    required_error: "Selecione o tipo da conta",
    invalid_type_error: "Tipo de conta inválido",
  }),
  
  limitInCents: z
    .number({ invalid_type_error: "O limite deve ser um número" })
    .min(0, { message: "O limite não pode ser negativo" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O limite não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    })
    .optional(),
  
  dueDate: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 31;
    }, { message: "A data de vencimento deve estar entre 1 e 31" }),
  
  closingDate: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 31;
    }, { message: "A data de fechamento deve estar entre 1 e 31" }),
  
  color: z.string().regex(/^#[0-9A-F]{6}$/i, { message: "Cor inválida" }),
}).refine((data) => {
  // Validação: se é cartão de crédito, limite e datas são obrigatórios
  if (data.type === "credit") {
    return data.limitInCents && data.limitInCents > 0 && data.dueDate && data.closingDate;
  }
  return true;
}, {
  message: "Cartões de crédito requerem limite, data de fechamento e data de vencimento",
  path: ["type"],
});

export type EditAccountFormData = z.infer<typeof editAccountSchema>;

// ============= Category Schemas =============

export const addCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "O nome é obrigatório" })
    .max(50, { message: "O nome deve ter no máximo 50 caracteres" })
    .refine(val => !/[<>]/.test(val), { message: "Caracteres inválidos detectados" }),
  
  type: z.enum(["income", "expense", "both"], {
    required_error: "Selecione o tipo da categoria",
    invalid_type_error: "Tipo de categoria inválido",
  }),
  
  color: z.string().regex(/^#[0-9A-F]{6}$/i, { message: "Cor inválida" }),
});

export type AddCategoryFormData = z.infer<typeof addCategorySchema>;

export const editCategorySchema = z.object({
  id: z.string().uuid({ message: "ID da categoria inválido" }),
  name: z
    .string()
    .trim()
    .min(1, { message: "O nome é obrigatório" })
    .max(50, { message: "O nome deve ter no máximo 50 caracteres" }),
  
  type: z.enum(["income", "expense", "both"], {
    required_error: "Selecione o tipo da categoria",
    invalid_type_error: "Tipo de categoria inválido",
  }),
  
  color: z.string().regex(/^#[0-9A-F]{6}$/i, { message: "Cor inválida" }),
});

export type EditCategoryFormData = z.infer<typeof editCategorySchema>;

// ============= Transaction Schemas =============

// Base schema para AddTransactionModal
const addTransactionBaseSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, { message: "A descrição é obrigatória" })
    .max(MAX_DESCRIPTION_LENGTH, { 
      message: `A descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres` 
    })
    .refine(val => !/[<>]/.test(val), { message: "Caracteres inválidos detectados" }),
  
  amount: z
    .number({ invalid_type_error: "O valor deve ser um número" })
    .positive({ message: "O valor deve ser maior que zero" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O valor não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    }),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida. Use o formato AAAA-MM-DD" })
    .refine((dateStr) => {
      const date = new Date(dateStr + "T00:00:00");
      return !isNaN(date.getTime());
    }, { message: "Data inválida" }),
  
  type: z
    .string({ required_error: "Selecione o tipo da transação" })
    .min(1, { message: "Selecione o tipo da transação" })
    .refine(
      (val) => ["income", "expense", "transfer"].includes(val),
      { message: "Tipo de transação inválido" }
    ),
  
  category_id: z
    .string()
    .refine((val) => val === "" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val), { 
      message: "Categoria inválida" 
    })
    .superRefine((val, ctx) => {
      // Será validado por refine() abaixo no .superRefine() que verifica type
      return true;
    }),
  
  account_id: z
    .string()
    .uuid({ message: "Conta inválida" })
    .min(1, { message: "Selecione uma conta" }),
  
  status: z.enum(["pending", "completed"], {
    invalid_type_error: "Status inválido",
  }),
  
  isInstallment: z.boolean().optional(),
  
  installments: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      if (val === "custom") return true; // "custom" é válido aqui
      const num = parseInt(val);
      return !isNaN(num) && num >= 2 && num <= 360;
    }, { message: "O número de parcelas deve estar entre 2 e 360" }),
  
  customInstallments: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 2 && num <= 360;
    }, { message: "O número de parcelas deve estar entre 2 e 360" }),
  
  invoiceMonth: z.string().optional(),
  
  isFixed: z.boolean().optional(),
});

export const addTransactionSchema = addTransactionBaseSchema.superRefine((data, ctx) => {
  // ✅ P1-3 FIX: Validação condicional de categoria
  // Categoria é obrigatória para income/expense, mas NÃO para transfer
  if (data.type !== "transfer" && !data.category_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["category_id"],
      message: "Selecione uma categoria"
    });
  }
});

export type AddTransactionFormData = z.infer<typeof addTransactionSchema>;

// Schema para EditTransactionModal
export const editTransactionSchema = addTransactionBaseSchema.extend({
  id: z.string().uuid({ message: "ID da transação inválido" }),
}).superRefine((data, ctx) => {
  // ✅ P1-3 FIX: Validação condicional de categoria (mesmo que addTransactionSchema)
  // Categoria é obrigatória para income/expense, mas NÃO para transfer
  if (data.type !== "transfer" && !data.category_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["category_id"],
      message: "Selecione uma categoria"
    });
  }
});

export type EditTransactionFormData = z.infer<typeof editTransactionSchema>;

// Schema para transferências
export const transferSchema = z.object({
  amount: z
    .number({ invalid_type_error: "O valor deve ser um número" })
    .positive({ message: "O valor deve ser maior que zero" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O valor não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    }),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida. Use o formato AAAA-MM-DD" })
    .refine((dateStr) => {
      const date = new Date(dateStr + "T00:00:00");
      return !isNaN(date.getTime());
    }, { message: "Data inválida" }),
  
  from_account_id: z
    .string()
    .uuid({ message: "Conta de origem inválida" })
    .min(1, { message: "Selecione a conta de origem" }),
  
  to_account_id: z
    .string()
    .uuid({ message: "Conta de destino inválida" })
    .min(1, { message: "Selecione a conta de destino" }),
}).refine((data) => data.from_account_id !== data.to_account_id, {
  message: "A conta de origem não pode ser igual à conta de destino",
  path: ["to_account_id"],
});

export type TransferFormData = z.infer<typeof transferSchema>;

// ============= Credit Payment Schema =============

export const creditPaymentSchema = z.object({
  creditCardAccountId: z
    .string()
    .uuid({ message: "Cartão de crédito inválido" })
    .min(1, { message: "Selecione um cartão de crédito" }),
  
  debitAccountId: z
    .string()
    .uuid({ message: "Conta de débito inválida" })
    .min(1, { message: "Selecione a conta de pagamento" }),
  
  amount: z
    .number({ invalid_type_error: "O valor deve ser um número" })
    .positive({ message: "O valor deve ser maior que zero" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O valor não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    }),
  
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida. Use o formato AAAA-MM-DD" })
    .refine((dateStr) => {
      const date = new Date(dateStr + "T00:00:00");
      return !isNaN(date.getTime());
    }, { message: "Data inválida" }),
}).refine((data) => data.creditCardAccountId !== data.debitAccountId, {
  message: "O cartão de crédito não pode ser igual à conta de pagamento",
  path: ["debitAccountId"],
});

export type CreditPaymentFormData = z.infer<typeof creditPaymentSchema>;

// ============= Mark as Paid Schema =============

export const markAsPaidSchema = z.object({
  date: z.date({ required_error: "Selecione uma data" }),
  
  amount: z
    .number({ invalid_type_error: "O valor deve ser um número" })
    .positive({ message: "O valor deve ser maior que zero" })
    .max(MAX_TRANSACTION_AMOUNT, { 
      message: `O valor não pode ser maior que ${(MAX_TRANSACTION_AMOUNT / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` 
    }),
  
  accountId: z
    .string()
    .uuid({ message: "Conta inválida" })
    .min(1, { message: "Selecione uma conta" }),
  
  transactionId: z.string().uuid({ message: "ID da transação inválido" }),
});

export type MarkAsPaidFormData = z.infer<typeof markAsPaidSchema>;

// ============= Import Account Schema =============

export const importAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "O nome é obrigatório" })
    .max(100, { message: "O nome deve ter no máximo 100 caracteres" }),
  
  type: z.enum(["checking", "savings", "credit", "investment", "meal_voucher"], {
    required_error: "Selecione o tipo da conta",
    invalid_type_error: "Tipo de conta inválido",
  }),
  
  balance: z.number({ invalid_type_error: "O saldo deve ser um número" }).optional(),
  
  color: z.string().regex(/^#[0-9A-F]{6}$/i, { message: "Cor inválida" }).optional(),
  
  limit_amount: z
    .number({ invalid_type_error: "O limite deve ser um número" })
    .nonnegative({ message: "O limite deve ser zero ou maior" })
    .optional(),
  
  due_date: z
    .number({ invalid_type_error: "Data de vencimento inválida" })
    .int({ message: "Data de vencimento deve ser um número inteiro" })
    .min(1, { message: "A data de vencimento deve estar entre 1 e 31" })
    .max(31, { message: "A data de vencimento deve estar entre 1 e 31" })
    .optional(),
  
  closing_date: z
    .number({ invalid_type_error: "Data de fechamento inválida" })
    .int({ message: "Data de fechamento deve ser um número inteiro" })
    .min(1, { message: "A data de fechamento deve estar entre 1 e 31" })
    .max(31, { message: "A data de fechamento deve estar entre 1 e 31" })
    .optional(),
}).refine((data) => {
  // Validação: se é cartão de crédito, limite e datas são obrigatórios
  if (data.type === "credit") {
    return data.limit_amount !== undefined && 
           data.due_date !== undefined && 
           data.closing_date !== undefined;
  }
  return true;
}, {
  message: "Cartões de crédito requerem limite, data de vencimento e data de fechamento",
  path: ["type"],
});

export type ImportAccountFormData = z.infer<typeof importAccountSchema>;
