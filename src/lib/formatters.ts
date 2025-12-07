import { Account } from "@/types";

/**
 * Mapeamento de moedas para locales padrão
 */
const CURRENCY_LOCALES: Record<string, string> = {
  'BRL': 'pt-BR',
  'USD': 'en-US', 
  'EUR': 'de-DE',
  'GBP': 'en-GB',
  'JPY': 'ja-JP',
  'ARS': 'es-AR',
  'MXN': 'es-MX',
};

/**
 * Símbolos de moedas para fallback
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  'BRL': 'R$',
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'ARS': '$',
  'MXN': '$',
};

/**
 * Formata um valor numérico (em centavos) para uma string de moeda.
 * @param valueInCents O valor em centavos.
 * @param currency Código da moeda (padrão: 'BRL').
 * @param locale Locale para formatação (padrão: automático baseado na moeda).
 * @returns A string formatada, ex: "R$ 1.234,56".
 */
export function formatCurrency(
  valueInCents: number, 
  currency: string = 'BRL', 
  locale?: string
): string {
  const value = valueInCents / 100;
  const finalLocale = locale || CURRENCY_LOCALES[currency] || 'pt-BR';
  
  try {
    return new Intl.NumberFormat(finalLocale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    // Fallback se a moeda não for suportada
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol} ${value.toFixed(2).replace('.', ',')}`;
  }
}

/**
 * Calcula o saldo disponível de uma conta, considerando o saldo principal e o limite.
 * Para cartões de crédito: limite - dívida atual (balance é negativo quando há dívida)
 * Para outras contas: saldo + limite (overdraft)
 * @param account O objeto da conta.
 * @returns O saldo disponível em centavos.
 */
export function getAvailableBalance(account: Account | undefined): number {
  if (!account) return 0;
  
  if (account.type === 'credit') {
    // Cartão de crédito: saldo negativo = dívida
    // Disponível = limite - dívida
    const debt = Math.abs(Math.min(account.balance, 0));
    return (account.limit_amount || 0) - debt;
  }
  
  // Outras contas: saldo + limite (overdraft)
  return account.balance + (account.limit_amount || 0);
}

/**
 * Retorna a dívida de um cartão de crédito (sempre positivo).
 * @param account O objeto da conta.
 * @returns A dívida em centavos (positivo).
 */
export function getCreditCardDebt(account: Account | undefined): number {
  if (!account || account.type !== 'credit') return 0;
  // Se balance é negativo, retorna o valor absoluto (dívida)
  // Se balance é positivo, retorna 0 (tem crédito a favor)
  return Math.abs(Math.min(account.balance, 0));
}

/**
 * Verifica se o cartão tem crédito a favor do cliente.
 * @param account O objeto da conta.
 * @returns true se há crédito a favor (balance positivo).
 */
export function hasCreditInFavor(account: Account | undefined): boolean {
  if (!account || account.type !== 'credit') return false;
  return account.balance > 0;
}

/**
 * Formata um número (em centavos) para o padrão brasileiro.
 * @param valueInCents O valor em centavos.
 * @returns String formatada no padrão BR (vírgula como decimal, ponto como milhar).
 */
export function formatBRNumber(valueInCents: number): string {
  const value = valueInCents / 100;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}