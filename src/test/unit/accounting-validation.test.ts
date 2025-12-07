import { describe, it, expect } from 'vitest';

/**
 * TESTES UNITÁRIOS - VALIDAÇÃO CONTÁBIL
 * 
 * Valida lógica de cálculo de partidas dobradas sem dependência de DB
 */

interface JournalEntry {
  entry_type: 'debit' | 'credit';
  amount: number;
  account_id: string;
}

describe('Accounting Validation Logic', () => {
  /**
   * Função auxiliar para validar partidas dobradas
   */
  function validateDoubleEntry(entries: JournalEntry[]): {
    isValid: boolean;
    totalDebits: number;
    totalCredits: number;
    difference: number;
    message: string;
  } {
    const debits = entries
      .filter(e => e.entry_type === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);

    const credits = entries
      .filter(e => e.entry_type === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);

    const diff = debits - credits;

    return {
      isValid: diff === 0,
      totalDebits: debits,
      totalCredits: credits,
      difference: diff,
      message:
        diff === 0
          ? 'Partidas dobradas válidas'
          : diff > 0
          ? `Débitos excedem créditos em ${Math.abs(diff)}`
          : `Créditos excedem débitos em ${Math.abs(diff)}`,
    };
  }

  describe('Transação de Income (Receita)', () => {
    it('should validate balanced income entries', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 5000, account_id: 'asset-1' }, // Entra dinheiro no ativo
        { entry_type: 'credit', amount: 5000, account_id: 'revenue-1' }, // Crédito na receita
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(5000);
      expect(result.totalCredits).toBe(5000);
      expect(result.difference).toBe(0);
    });

    it('should detect unbalanced income entries', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 5000, account_id: 'asset-1' },
        { entry_type: 'credit', amount: 4000, account_id: 'revenue-1' }, // Erro: valores diferentes
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(false);
      expect(result.difference).toBe(1000); // Débitos excedem em 1000
    });
  });

  describe('Transação de Expense (Despesa)', () => {
    it('should validate balanced expense entries', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 3000, account_id: 'expense-1' }, // Débito na despesa
        { entry_type: 'credit', amount: 3000, account_id: 'asset-1' }, // Sai dinheiro do ativo
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(3000);
      expect(result.totalCredits).toBe(3000);
      expect(result.difference).toBe(0);
    });

    it('should validate expense to credit card (liability)', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 2000, account_id: 'expense-1' },
        { entry_type: 'credit', amount: 2000, account_id: 'liability-card' }, // Aumenta dívida
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.difference).toBe(0);
    });
  });

  describe('Transferência entre Contas', () => {
    it('should validate balanced transfer entries', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 1000, account_id: 'asset-savings' }, // Entra na poupança
        { entry_type: 'credit', amount: 1000, account_id: 'asset-checking' }, // Sai da corrente
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(1000);
      expect(result.totalCredits).toBe(1000);
    });
  });

  describe('Pagamento de Fatura (Bill Payment)', () => {
    it('should validate balanced bill payment', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 1500, account_id: 'liability-card' }, // Reduz dívida (débito em passivo)
        { entry_type: 'credit', amount: 1500, account_id: 'asset-checking' }, // Sai dinheiro (crédito em ativo)
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.difference).toBe(0);
    });
  });

  describe('Múltiplas Entradas (Lançamentos Complexos)', () => {
    it('should validate multiple debit entries against one credit', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 1000, account_id: 'expense-food' },
        { entry_type: 'debit', amount: 500, account_id: 'expense-transport' },
        { entry_type: 'credit', amount: 1500, account_id: 'asset-checking' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(1500);
      expect(result.totalCredits).toBe(1500);
    });

    it('should validate one debit against multiple credits', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 2000, account_id: 'asset-checking' },
        { entry_type: 'credit', amount: 1200, account_id: 'revenue-salary' },
        { entry_type: 'credit', amount: 800, account_id: 'revenue-freelance' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(2000);
      expect(result.totalCredits).toBe(2000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amounts', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 0, account_id: 'asset-1' },
        { entry_type: 'credit', amount: 0, account_id: 'revenue-1' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(0);
      expect(result.totalCredits).toBe(0);
    });

    it('should handle empty entries array', () => {
      const entries: JournalEntry[] = [];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(0);
      expect(result.totalCredits).toBe(0);
    });

    it('should detect missing credit entry', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 5000, account_id: 'asset-1' },
        // Falta o crédito correspondente
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(false);
      expect(result.difference).toBe(5000);
      expect(result.message).toContain('Débitos excedem créditos');
    });

    it('should detect missing debit entry', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'credit', amount: 3000, account_id: 'revenue-1' },
        // Falta o débito correspondente
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(false);
      expect(result.difference).toBe(-3000);
      expect(result.message).toContain('Créditos excedem débitos');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should validate salary payment scenario', () => {
      // Cenário: Recebimento de salário R$ 5.000
      // - Entra R$ 5.000 na conta corrente (débito ativo)
      // - Reconhece R$ 5.000 de receita (crédito receita)
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 500000, account_id: 'asset-checking' },
        { entry_type: 'credit', amount: 500000, account_id: 'revenue-salary' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
    });

    it('should validate credit card purchase scenario', () => {
      // Cenário: Compra no cartão R$ 200
      // - Aumenta despesa R$ 200 (débito despesa)
      // - Aumenta dívida R$ 200 (crédito passivo)
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 20000, account_id: 'expense-shopping' },
        { entry_type: 'credit', amount: 20000, account_id: 'liability-card' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
    });

    it('should validate credit card payment scenario', () => {
      // Cenário: Pagamento de fatura R$ 800
      // - Reduz dívida R$ 800 (débito passivo)
      // - Sai dinheiro R$ 800 (crédito ativo)
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 80000, account_id: 'liability-card' },
        { entry_type: 'credit', amount: 80000, account_id: 'asset-checking' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
    });

    it('should validate investment transfer scenario', () => {
      // Cenário: Transferir R$ 1.000 para investimentos
      // - Aumenta investimentos R$ 1.000 (débito ativo investimento)
      // - Diminui conta corrente R$ 1.000 (crédito ativo corrente)
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 100000, account_id: 'asset-investment' },
        { entry_type: 'credit', amount: 100000, account_id: 'asset-checking' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Precision and Rounding', () => {
    it('should handle decimal precision correctly', () => {
      // Valores em centavos para evitar problemas de precisão
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 12345, account_id: 'asset-1' }, // R$ 123,45
        { entry_type: 'credit', amount: 12345, account_id: 'revenue-1' },
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(true);
      expect(result.difference).toBe(0);
    });

    it('should detect small rounding errors', () => {
      const entries: JournalEntry[] = [
        { entry_type: 'debit', amount: 33333, account_id: 'asset-1' },
        { entry_type: 'credit', amount: 33334, account_id: 'revenue-1' }, // 1 centavo de diferença
      ];

      const result = validateDoubleEntry(entries);

      expect(result.isValid).toBe(false);
      expect(result.difference).toBe(-1);
    });
  });
});
