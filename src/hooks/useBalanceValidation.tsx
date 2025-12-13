import { useMemo } from 'react';
import { Account } from '@/types';
import { formatCurrency } from '@/lib/formatters';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type ValidationStatus = 'success' | 'warning' | 'danger';

export interface BalanceValidationResult {
  isValid: boolean;
  status: ValidationStatus;
  message: string;
  details: {
    currentBalance: number;
    limit: number;
    available: number;
    balanceAfter: number;
    used?: number;
    pending?: number;
  };
  errorMessage?: string;
}

interface UseBalanceValidationOptions {
  account: Account | undefined;
  amountInCents: number;
  transactionType: 'income' | 'expense';
  excludeTransactionId?: string; // Para edição: excluir transação atual da validação
  existingTransactionAmount?: number; // Para edição: valor original da transação
  existingTransactionType?: 'income' | 'expense'; // Para edição: tipo original
}

/**
 * Hook centralizado para validação de saldo/limite de contas
 * Elimina duplicação de lógica de validação nos modais
 */
export function useBalanceValidation({
  account,
  amountInCents,
  transactionType,
  excludeTransactionId,
  existingTransactionAmount,
  existingTransactionType,
}: UseBalanceValidationOptions): BalanceValidationResult {
  return useMemo(() => {
    // Default result para conta não selecionada
    if (!account) {
      return {
        isValid: true,
        status: 'success',
        message: 'Selecione uma conta',
        details: {
          currentBalance: 0,
          limit: 0,
          available: 0,
          balanceAfter: 0,
        },
      };
    }

    const currentBalance = account.balance;
    const limit = account.limit_amount || 0;

    // VALIDAÇÃO PARA RECEITAS (sempre válidas, apenas calculam saldo após)
    if (transactionType === 'income') {
      const balanceAfter = currentBalance + amountInCents;
      
      return {
        isValid: true,
        status: 'success',
        message: account.type === 'credit' ? 'Pagamento' : 'Receita',
        details: {
          currentBalance,
          limit,
          available: currentBalance + limit,
          balanceAfter,
        },
      };
    }

    // VALIDAÇÃO PARA DESPESAS EM CARTÃO DE CRÉDITO
    if (account.type === 'credit') {
      const currentDebt = Math.abs(Math.min(currentBalance, 0));
      const available = limit - currentDebt;
      
      // Calcular o impacto da transação
      let amountDifference = amountInCents;
      
      // Se estamos editando uma transação existente
      if (existingTransactionAmount !== undefined && existingTransactionType) {
        if (existingTransactionType === 'expense') {
          // Era despesa, calcular diferença
          amountDifference = amountInCents - existingTransactionAmount;
        } else {
          // Mudou de income para expense, impacto total
          amountDifference = amountInCents + existingTransactionAmount;
        }
      }

      const balanceAfter = currentBalance - amountDifference;
      const newDebt = Math.abs(Math.min(balanceAfter, 0));
      const remaining = limit - newDebt;

      // Validação: excedeu o limite?
      if (amountDifference > available && amountDifference > 0) {
        return {
          isValid: false,
          status: 'danger',
          message: 'Limite excedido',
          details: {
            currentBalance,
            limit,
            available,
            balanceAfter,
            used: currentDebt,
          },
          errorMessage: `Disponível: ${formatCurrency(available)} | Limite: ${formatCurrency(limit)} | Usado: ${formatCurrency(currentDebt)} | Solicitado: ${formatCurrency(amountDifference)}`,
        };
      }

      // Warning: próximo ao limite (< 20% disponível)
      if (remaining < limit * 0.2 && remaining > 0) {
        return {
          isValid: true,
          status: 'warning',
          message: 'Próximo ao limite',
          details: {
            currentBalance,
            limit,
            available,
            balanceAfter,
            used: currentDebt,
          },
        };
      }

      // Success
      return {
        isValid: true,
        status: 'success',
        message: 'Limite disponível',
        details: {
          currentBalance,
          limit,
          available,
          balanceAfter,
          used: currentDebt,
        },
      };
    }

    // VALIDAÇÃO PARA DESPESAS EM CONTAS NORMAIS (checking, savings, investment)
    const available = currentBalance + limit;
    
    // Calcular o impacto da transação
    let amountDifference = amountInCents;
    
    // Se estamos editando uma transação existente
    if (existingTransactionAmount !== undefined && existingTransactionType) {
      if (existingTransactionType === 'expense') {
        // Era despesa, calcular diferença
        amountDifference = amountInCents - existingTransactionAmount;
      } else {
        // Mudou de income para expense, impacto total
        amountDifference = amountInCents + existingTransactionAmount;
      }
    }

    const balanceAfter = currentBalance - amountDifference;
    const remainingAfter = balanceAfter + limit;

    // Validação: saldo insuficiente?
    if (amountDifference > available && amountDifference > 0) {
      return {
        isValid: false,
        status: 'danger',
        message: 'Saldo insuficiente',
        details: {
          currentBalance,
          limit,
          available,
          balanceAfter,
        },
        errorMessage: `Disponível: ${formatCurrency(available)} | Saldo: ${formatCurrency(currentBalance)}${limit > 0 ? ` + Limite: ${formatCurrency(limit)}` : ''} | Solicitado: ${formatCurrency(amountDifference)}`,
      };
    }

    // Warning: saldo baixo após transação (< 20% do disponível)
    if (remainingAfter < available * 0.2 && remainingAfter > 0) {
      return {
        isValid: true,
        status: 'warning',
        message: 'Saldo baixo após transação',
        details: {
          currentBalance,
          limit,
          available,
          balanceAfter,
        },
      };
    }

    // Success
    return {
      isValid: true,
      status: 'success',
      message: 'Saldo suficiente',
      details: {
        currentBalance,
        limit,
        available,
        balanceAfter,
      },
    };
  }, [
    account,
    amountInCents,
    transactionType,
    excludeTransactionId,
    existingTransactionAmount,
    existingTransactionType,
  ]);
}

/**
 * Validação assíncrona para adicionar transações em cartão de crédito
 * Considera transações pendentes para validação precisa do limite disponível
 */
export async function validateCreditLimitForAdd(
  account: Account,
  amountInCents: number,
  transactionType: 'income' | 'expense'
): Promise<BalanceValidationResult> {
  try {
    // Receitas sempre são válidas
    if (transactionType === 'income') {
      return {
        isValid: true,
        status: 'success',
        message: 'Pagamento',
        details: {
          currentBalance: account.balance,
          limit: account.limit_amount || 0,
          available: account.balance + (account.limit_amount || 0),
          balanceAfter: account.balance + amountInCents,
        },
      };
    }

    // Para contas não-crédito, usar validação síncrona simples
    if (account.type !== 'credit') {
      const currentBalance = account.balance;
      const limit = account.limit_amount || 0;
      const available = currentBalance + limit;
      const balanceAfter = currentBalance - amountInCents;

      if (amountInCents > available) {
        return {
          isValid: false,
          status: 'danger',
          message: 'Saldo insuficiente',
          details: {
            currentBalance,
            limit,
            available,
            balanceAfter,
          },
          errorMessage: `Disponível: ${formatCurrency(available)} | Saldo: ${formatCurrency(currentBalance)}${limit > 0 ? ` + Limite: ${formatCurrency(limit)}` : ''} | Solicitado: ${formatCurrency(amountInCents)}`,
        };
      }

      return {
        isValid: true,
        status: 'success',
        message: 'Saldo suficiente',
        details: {
          currentBalance,
          limit,
          available,
          balanceAfter,
        },
      };
    }

    // BUG FIX: Para cartões de crédito, buscar APENAS transações PENDING
    // (completed já estão refletidas no account.balance)
    const { data: pendingTransactions, error: pendingError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('account_id', account.id)
      .eq('type', 'expense')
      .eq('status', 'pending'); // Apenas pending para evitar duplicação

    if (pendingError) throw pendingError;

    // Calcular valores
    const limit = account.limit_amount || 0;
    const currentDebt = Math.abs(Math.min(account.balance, 0)); // Dívida atual (completed)
    const pendingExpenses = pendingTransactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;
    const totalUsed = currentDebt + pendingExpenses; // Agora sem duplicação
    const available = limit - totalUsed;

    // Validar se excede o limite
    if (amountInCents > available) {
      return {
        isValid: false,
        status: 'danger',
        message: 'Limite de crédito excedido',
        details: {
          currentBalance: account.balance,
          limit,
          available,
          balanceAfter: account.balance - amountInCents,
          used: totalUsed,
          pending: pendingExpenses,
        },
        errorMessage: `Disponível: ${formatCurrency(available)} | Limite: ${formatCurrency(limit)} | Usado: ${formatCurrency(totalUsed)} | Solicitado: ${formatCurrency(amountInCents)}`,
      };
    }

    // Warning se próximo ao limite
    const remaining = available - amountInCents;
    if (remaining < limit * 0.2 && remaining > 0) {
      return {
        isValid: true,
        status: 'warning',
        message: 'Próximo ao limite',
        details: {
          currentBalance: account.balance,
          limit,
          available,
          balanceAfter: account.balance - amountInCents,
          used: totalUsed,
          pending: pendingExpenses,
        },
      };
    }

    return {
      isValid: true,
      status: 'success',
      message: 'Limite disponível',
      details: {
        currentBalance: account.balance,
        limit,
        available,
        balanceAfter: account.balance - amountInCents,
        used: totalUsed,
        pending: pendingExpenses,
      },
    };
  } catch (error) {
    logger.error('Error validating credit limit:', error);
    // CRÍTICO: Retornar inválido em caso de erro para segurança
    return {
      isValid: false,
      status: 'danger',
      message: 'Erro ao validar limite',
      details: {
        currentBalance: account.balance,
        limit: account.limit_amount || 0,
        available: (account.limit_amount || 0) - Math.abs(Math.min(account.balance, 0)),
        balanceAfter: account.balance - amountInCents,
      },
      errorMessage: 'Erro ao verificar limite disponível. Por favor, tente novamente.',
    };
  }
}

/**
 * Validação unificada para edição de transações
 * Funciona para todos os tipos de conta (credit, checking, savings, investment)
 */
export async function validateBalanceForEdit(
  account: Account,
  newAmount: number,
  oldAmount: number,
  newType: 'income' | 'expense',
  oldType: 'income' | 'expense',
  transactionId: string,
  transactionStatus: 'pending' | 'completed'
): Promise<BalanceValidationResult> {
  // Para cartões de crédito, usar validação assíncrona com pending
  if (account.type === 'credit') {
    return validateCreditLimitForEdit(
      account,
      newAmount,
      oldAmount,
      newType,
      oldType,
      transactionId,
      transactionStatus
    );
  }

  // Para contas normais, validação síncrona de saldo
  try {
    // Calcular a diferença de impacto no saldo
    let amountDifference = 0;
    
    if (oldType === 'expense' && newType === 'expense') {
      amountDifference = newAmount - oldAmount;
    } else if (oldType === 'income' && newType === 'expense') {
      amountDifference = newAmount + oldAmount;
    } else if (oldType === 'expense' && newType === 'income') {
      amountDifference = -(oldAmount + newAmount);
    }

    // Só validar se está aumentando o uso do saldo
    if (amountDifference <= 0) {
      return {
        isValid: true,
        status: 'success',
        message: 'Saldo suficiente',
        details: {
          currentBalance: account.balance,
          limit: account.limit_amount || 0,
          available: account.balance + (account.limit_amount || 0),
          balanceAfter: account.balance - amountDifference,
        },
      };
    }

    const currentBalance = account.balance;
    const limit = account.limit_amount || 0;
    
    // Adicionar o valor antigo de volta se era completed expense
    let adjustedBalance = currentBalance;
    if (transactionStatus === 'completed' && oldType === 'expense') {
      adjustedBalance = adjustedBalance + oldAmount;
    }
    
    const available = adjustedBalance + limit;

    // Verificar se tem saldo suficiente
    if (amountDifference > available) {
      return {
        isValid: false,
        status: 'danger',
        message: 'Saldo insuficiente',
        details: {
          currentBalance,
          limit,
          available,
          balanceAfter: currentBalance - amountDifference,
        },
        errorMessage: limit > 0
          ? `Saldo insuficiente. Disponível: ${formatCurrency(available)} (Saldo: ${formatCurrency(adjustedBalance)} + Limite: ${formatCurrency(limit)}) | Aumento solicitado: ${formatCurrency(amountDifference)}`
          : `Saldo insuficiente. Disponível: ${formatCurrency(adjustedBalance)} | Aumento solicitado: ${formatCurrency(amountDifference)}`,
      };
    }

    return {
      isValid: true,
      status: 'success',
      message: 'Saldo suficiente',
      details: {
        currentBalance,
        limit,
        available,
        balanceAfter: currentBalance - amountDifference,
      },
    };
  } catch (error) {
    logger.error('Error validating balance for edit:', error);
    return {
      isValid: false,
      status: 'danger',
      message: 'Erro ao validar saldo',
      details: {
        currentBalance: account.balance,
        limit: account.limit_amount || 0,
        available: account.balance + (account.limit_amount || 0),
        balanceAfter: account.balance,
      },
      errorMessage: 'Erro ao verificar saldo disponível. Por favor, tente novamente.',
    };
  }
}

/**
 * Validação assíncrona para edição de transações em cartão de crédito
 * Considera transações pendentes e exclui a transação sendo editada
 */
export async function validateCreditLimitForEdit(
  account: Account,
  newAmount: number,
  oldAmount: number,
  newType: 'income' | 'expense',
  oldType: 'income' | 'expense',
  transactionId: string,
  transactionStatus: 'pending' | 'completed'
): Promise<BalanceValidationResult> {
  try {
    // Calcular a diferença de impacto no limite
    let amountDifference = 0;
    
    if (oldType === 'expense' && newType === 'expense') {
      amountDifference = newAmount - oldAmount;
    } else if (oldType === 'income' && newType === 'expense') {
      amountDifference = newAmount + oldAmount;
    } else if (oldType === 'expense' && newType === 'income') {
      amountDifference = -(oldAmount + newAmount);
    }

    // Só validar se está aumentando o uso do limite
    if (amountDifference <= 0) {
      return {
        isValid: true,
        status: 'success',
        message: 'Limite disponível',
        details: {
          currentBalance: account.balance,
          limit: account.limit_amount || 0,
          available: (account.limit_amount || 0) - Math.abs(Math.min(account.balance, 0)),
          balanceAfter: account.balance - amountDifference,
        },
      };
    }

    // BUG FIX: Buscar APENAS transações PENDING (excluindo a atual)
    // Completed já estão no account.balance, buscar completed causaria duplicação
    const { data: pendingTransactions, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('account_id', account.id)
      .eq('type', 'expense')
      .eq('status', 'pending') // Apenas pending
      .neq('id', transactionId);

    if (error) throw error;

    // Calcular valores
    const limit = account.limit_amount || 0;
    const currentDebt = Math.abs(Math.min(account.balance, 0));
    const pendingExpenses = pendingTransactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;
    
    // Remover o valor antigo da transação se ela era completed e expense
    // (pois ela está incluída no currentDebt via account.balance)
    let adjustedDebt = currentDebt;
    if (transactionStatus === 'completed' && oldType === 'expense') {
      adjustedDebt = Math.max(0, adjustedDebt - oldAmount);
    }
    
    const totalUsed = adjustedDebt + pendingExpenses;
    const available = limit - totalUsed;

    // Verificar se a diferença excede o limite
    if (amountDifference > available) {
      return {
        isValid: false,
        status: 'danger',
        message: 'Limite excedido',
        details: {
          currentBalance: account.balance,
          limit,
          available,
          balanceAfter: account.balance - amountDifference,
          used: totalUsed,
          pending: pendingExpenses,
        },
        errorMessage: `Disponível: ${formatCurrency(available)} | Limite: ${formatCurrency(limit)} | Usado: ${formatCurrency(totalUsed)} | Aumento solicitado: ${formatCurrency(amountDifference)}`,
      };
    }

    return {
      isValid: true,
      status: 'success',
      message: 'Limite disponível',
      details: {
        currentBalance: account.balance,
        limit,
        available,
        balanceAfter: account.balance - amountDifference,
        used: totalUsed,
        pending: pendingExpenses,
      },
    };
  } catch (error) {
    logger.error('Error validating credit limit for edit:', error);
    // CRÍTICO: Retornar inválido em caso de erro para segurança
    return {
      isValid: false,
      status: 'danger',
      message: 'Erro ao validar limite',
      details: {
        currentBalance: account.balance,
        limit: account.limit_amount || 0,
        available: (account.limit_amount || 0) - Math.abs(Math.min(account.balance, 0)),
        balanceAfter: account.balance,
      },
      errorMessage: 'Erro ao verificar limite disponível. Por favor, tente novamente.',
    };
  }
}
