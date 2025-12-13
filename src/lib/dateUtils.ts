import { addMonths, format } from "date-fns";
import { Account, AppTransaction } from "@/types";
import { logger } from "@/lib/logger";
import { toUserTimezone, getTodayInUserTimezone } from "@/lib/timezone";

/**
 * Helper para criar uma data de fallback (1970) quando o parse falha.
 */
function createFallbackDate(invalidInput?: unknown): Date {
  logger.warn(
    "createDateFromString não conseguiu parsear:",
    invalidInput,
    ". Usando data de fallback (1970)."
  );
  return new Date(0); // Retorna "1 Jan 1970"
}

/**
 * Calcula o mês de fatura (YYYY-MM) baseado na DATA DA COMPRA e DIA DE FECHAMENTO.
 * ✅ BUGFIX: Agora usa timezone do usuário corretamente
 * ✅ BUGFIX: O mês da fatura é o mês de FECHAMENTO (não de vencimento)
 * 
 * Regra: O mês da fatura identifica quando as compras foram FECHADAS.
 *        O vencimento é apenas um prazo para pagamento APÓS o fechamento.
 * 
 * Exemplo: Fechamento dia 30, Vencimento dia 7
 * - Compra em 12/11 → Fecha em 30/11 → Mês da fatura = "2025-11" (novembro)
 * - Compra em 05/12 → Fecha em 30/12 → Mês da fatura = "2025-12" (dezembro)
 * 
 * Exemplo: Fechamento dia 3, Vencimento dia 7
 * - Compra em 02/12 → Fecha em 03/12 → Mês da fatura = "2025-12" (dezembro)
 * - Compra em 05/12 → Fecha em 03/01 → Mês da fatura = "2026-01" (janeiro)
 */
export function calculateInvoiceMonthByDue(
  transactionDate: Date,
  closingDate: number,
  dueDate: number = 10
): string {
  // ✅ BUGFIX: Converte para timezone do usuário
  const txDate = toUserTimezone(transactionDate);

  const txDay = txDate.getDate();
  const txMonth = txDate.getMonth();
  const txYear = txDate.getFullYear();

  // Determina quando a fatura FECHA
  // O mês da fatura é sempre o mês de FECHAMENTO
  let billingCycleMonth: number;
  let billingCycleYear: number;

  if (txDay <= closingDate) {
    // Transação no período atual - fecha no mês corrente
    billingCycleMonth = txMonth;
    billingCycleYear = txYear;
  } else {
    // Transação após o fechamento - vai para o próximo ciclo
    billingCycleMonth = txMonth + 1;
    billingCycleYear = txYear;
    if (billingCycleMonth > 11) {
      billingCycleMonth = 0;
      billingCycleYear++;
    }
  }

  // Retorna o mês de FECHAMENTO como identificador da fatura
  const result = `${billingCycleYear}-${String(billingCycleMonth + 1).padStart(2, '0')}`;

  return result;
}

/**
 * Retorna a data de hoje como uma string no formato "YYYY-MM-DD".
 * ✅ BUGFIX P0: Agora usa o sistema de timezone robusto
 */
export function getTodayString(): string {
  return getTodayInUserTimezone();
}

/**
 * Adiciona um número de meses a uma data.
 */
export function addMonthsToDate(date: Date, months: number): Date {
  return addMonths(date, months);
}

/**
 * Cria um objeto Date a partir de qualquer input (string, nulo, etc),
 * garantindo que não haja problemas de fuso horário e NUNCA quebre.
 * BUG FIX: Agora usa o sistema de timezone robusto do timezone.ts
 */
export function createDateFromString(dateInput: unknown): Date {
  const dateString = String(dateInput || "").trim();
  if (dateString === "") {
    return createFallbackDate(dateInput);
  }

  // Trata Date object diretamente
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    // BUG FIX: Converte para o timezone do usuário
    return toUserTimezone(dateInput);
  }

  // Tenta ISO 8601
  if (dateString.includes("T") || dateString.includes("Z")) {
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      // BUG FIX: Converte para o timezone do usuário
      return toUserTimezone(d);
    }
  }

  // Tenta YYYY-MM-DD - usa o sistema de timezone
  try {
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [_, year, month, day] = match.map(Number);
      if (year && month && day) {
        // BUG FIX: Cria Date no timezone do usuário
        const d = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (!isNaN(d.getTime())) {
          return toUserTimezone(d);
        }
      }
    }
  } catch (e) { /* ignora */ }

  // Fallback final
  const d = new Date(dateString);
  if (!isNaN(d.getTime())) {
    // BUG FIX: Converte para o timezone do usuário
    return toUserTimezone(d);
  }

  return createFallbackDate(dateInput);
}

/**
 * Normalize transaction date to Date object
 * Use this helper to ensure consistent date handling across the app
 */
export function normalizeTransactionDate<T extends { date: string | Date }>(
  transaction: T
): T & { date: Date } {
  return {
    ...transaction,
    date: createDateFromString(transaction.date)
  };
}

/**
 * Normalize array of transactions dates
 * Convenience function for bulk normalization
 */
export function normalizeTransactionDates<T extends { date: string | Date }>(
  transactions: T[]
): Array<T & { date: Date }> {
  return transactions.map(normalizeTransactionDate);
}

/**
 * Calcula os valores da fatura atual e da próxima fatura
 * com base nas transações e datas do cartão.
 * ✅ BUGFIX P0: Agora usa timezone do usuário corretamente
 * @param monthOffset - Offset de meses (0 = atual, 1 = próximo, -1 = anterior)
 */
export function calculateBillDetails(
  transactions: AppTransaction[],
  account: Account,
  monthOffset: number = 0
) {
  // Retorna vazio se a conta não for de crédito
  if (!account.closing_date || !account.due_date) {
    return {
      currentBillAmount: 0,
      nextBillAmount: 0,
      totalBalance: 0,
      availableLimit: 0,
      paymentTransactions: [],
    };
  }
  
  // ✅ BUGFIX P0: Usar timezone do usuário
  const today = toUserTimezone(new Date());
  const closingDate = account.closing_date || 1; 

  // Aplica o offset de meses à data de referência
  const referenceDate = addMonths(today, monthOffset);
  
  // ✅ BUGFIX P0: Usar timezone do usuário para normalização
  const todayNormalized = toUserTimezone(referenceDate);

  // --- Lógica de data usando timezone do usuário ---
  // A navegação por meses SEMPRE mostra as faturas que FECHAM naquele mês
  // Não importa se o usuário está vendo o mês atual ou navegando
  
  // ✅ BUGFIX: Ajusta o dia de fechamento se não existir no mês (ex: 30/fev → 28/fev)
  // Cria a data e verifica se o mês mudou (overflow)
  let currentBillEnd = new Date(
    todayNormalized.getFullYear(),
    todayNormalized.getMonth(),
    closingDate, 12, 0, 0
  );
  
  // Se o mês mudou (ex: tentou criar 30/fev e virou março), usa o último dia do mês correto
  if (currentBillEnd.getMonth() !== todayNormalized.getMonth()) {
    currentBillEnd = new Date(
      todayNormalized.getFullYear(),
      todayNormalized.getMonth() + 1,
      0, 12, 0, 0  // Dia 0 = último dia do mês anterior
    );
  }

  const nextBillStart = new Date(currentBillEnd.getTime() + 24 * 60 * 60 * 1000);
  
  // ✅ BUGFIX: Mesmo ajuste para a próxima fatura
  let nextBillEnd = new Date(
    nextBillStart.getFullYear(),
    nextBillStart.getMonth() + 1,
    closingDate, 12, 0, 0
  );
  
  // Calcula qual seria o mês correto antes do ajuste
  const expectedNextMonth = nextBillStart.getMonth() + 1 > 11 ? 0 : nextBillStart.getMonth() + 1;
  if (nextBillEnd.getMonth() !== expectedNextMonth) {
    nextBillEnd = new Date(
      nextBillStart.getFullYear(),
      expectedNextMonth + 1,
      0, 12, 0, 0  // Dia 0 = último dia do mês anterior
    );
  }

  // Calcula o mês da fatura baseado na data de FECHAMENTO no formato YYYY-MM
  const currentInvoiceMonth = format(currentBillEnd, "yyyy-MM");
  const nextInvoiceMonth = format(nextBillEnd, "yyyy-MM");

  // --- INÍCIO DA CORREÇÃO (Saldo Credor e Saldo Parcial) ---
  let currentBillAmount = 0;
  let nextBillAmount = 0;
  let newTotalBalance = 0; // Saldo devedor total (limite utilizado)
  const paymentTransactions: AppTransaction[] = []; // <-- ADICIONADO

  for (const t of transactions) {
    const tDate = t.date; // t.date agora é um Objeto Date
    
    if (!tDate || isNaN(tDate.getTime())) {
      logger.warn('Transação com data inválida:', t.id, t.description);
      continue; // Pula datas inválidas
    }

    // 1. Calcula o Saldo Total (Limite Utilizado)
    // Soma despesas (aumenta dívida) e subtrai pagamentos (diminui dívida)
    // APENAS transações concluídas são contabilizadas
    if (t.status === 'completed') {
      if (t.type === 'expense') {
        newTotalBalance += Math.abs(t.amount);
      } else if (t.type === 'income') {
        newTotalBalance -= Math.abs(t.amount); // Subtrai pagamentos
      }
    }

    // 2. Calcula o Saldo da Fatura Atual (currentBillAmount)
    // Se o usuário marcou override manual, usa o invoice_month salvo; caso contrário calcula
    const effectiveInvoiceMonth = ('invoice_month_overridden' in t && t.invoice_month_overridden && t.invoice_month)
      ? t.invoice_month
      : (account.closing_date
          ? calculateInvoiceMonthByDue(tDate, account.closing_date, account.due_date || 1)
          : format(tDate, "yyyy-MM"));

    const belongsToCurrentBill = effectiveInvoiceMonth === currentInvoiceMonth;

    if (belongsToCurrentBill) {
      // APENAS transações concluídas são contabilizadas na fatura
      if (t.status === 'completed') {
        if (t.type === 'expense') {
          currentBillAmount += Math.abs(t.amount);
        } else if (t.type === 'income') {
          currentBillAmount -= Math.abs(t.amount);
          paymentTransactions.push(t);
        }
      }
    }
    // 3. Calcula a Próxima Fatura (nextBillAmount)
    else {
      const belongsToNextBill = effectiveInvoiceMonth === nextInvoiceMonth;
      // APENAS transações concluídas são contabilizadas na próxima fatura
      if (belongsToNextBill && t.type === 'expense' && t.status === 'completed') {
        nextBillAmount += Math.abs(t.amount);
      }
    }
  }

  // 4. Usa os novos valores calculados
  const totalBalance = newTotalBalance; // Saldo devedor total (correto)
  const availableLimit = (account.limit_amount || 0) - totalBalance; // Limite disponível (correto)
  // --- FIM DA CORREÇÃO ---

  return {
    currentBillAmount, // Agora pode ser negativo (crédito)
    nextBillAmount,    // Próxima Fatura (apenas despesas)
    totalBalance,      // Limite Utilizado (saldo devedor total)
    availableLimit,    // Limite Disponível
    paymentTransactions, // <-- ADICIONADO
    currentInvoiceMonth, // <-- ADICIONADO: mês (YYYY-MM) da fatura atual
    nextInvoiceMonth,    // <-- ADICIONADO: mês (YYYY-MM) da próxima fatura
  };
}