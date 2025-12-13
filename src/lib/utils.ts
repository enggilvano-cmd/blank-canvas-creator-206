import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converte uma string de moeda (ex: "1.234,56") para centavos de forma segura.
 * @param value A string representando o valor monetário.
 * @returns O valor em centavos como um número inteiro.
 */
export function currencyStringToCents(value: string): number {
  if (typeof value !== "string") return NaN;
 
  // Limpa qualquer caractere que não seja dígito, vírgula ou ponto.
  let cleanValue = value.replace(/[^\d,.]/g, "");
 
  // Verifica se a string usa vírgula como separador decimal.
  // Se houver uma vírgula, assume que pontos são separadores de milhar.
  if (cleanValue.includes(',')) {
    // Remove os pontos (milhar) e substitui a vírgula (decimal) por ponto.
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
  } else {
    // Se não houver vírgula, remove os pontos de milhar, exceto o último, que pode ser decimal.
    const parts = cleanValue.split('.');
    if (parts.length > 1) {
      cleanValue = parts.slice(0, -1).join('') + '.' + parts.slice(-1);
    }
  }
 
  // Converte para número de ponto flutuante e multiplica por 100
  const floatVal = parseFloat(cleanValue);
 
  // Retorna o valor em centavos ou NaN se inválido
  return isNaN(floatVal) ? NaN : Math.round(floatVal * 100);
}

/**
 * Gera um UUID v4 compatível com todos os browsers
 * Usa crypto.randomUUID() se disponível, caso contrário usa fallback
 * @returns UUID v4 string
 */
export function generateUUID(): string {
  // Tenta usar a API nativa do browser (mais seguro e performático)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // Fallback se crypto.randomUUID() falhar (contexto inseguro, etc)
    }
  }
  
  // Fallback: gera UUID v4 manualmente
  // Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

