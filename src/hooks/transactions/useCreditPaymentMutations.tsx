import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '../queries/useAccounts';
import { Account, Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

export function useCreditPaymentMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { accounts } = useAccounts();

  const handleCreditPayment = useCallback(async ({
    creditCardAccountId,
    debitAccountId,
    amount,
    paymentDate,
  }: {
    creditCardAccountId: string;
    debitAccountId: string;
    amount: number;
    paymentDate: string;
  }): Promise<{ creditAccount: Account; bankAccount: Account }> => {
    if (!user) throw new Error('Usuário não autenticado');

    try {
      const creditAccount = accounts.find((acc) => acc.id === creditCardAccountId);
      const bankAccount = accounts.find((acc) => acc.id === debitAccountId);

      if (!creditAccount || !bankAccount) {
        throw new Error('Conta de crédito ou conta bancária não encontrada.');
      }

      const { data, error } = await supabase.functions.invoke('atomic-pay-bill', {
        body: {
          credit_account_id: creditCardAccountId,
          debit_account_id: debitAccountId,
          amount: Math.abs(amount),
          payment_date: paymentDate,
        }
      });

      if (error) {
        logger.error('Erro ao processar pagamento de fatura:', error);
        throw new Error(error.message || 'Falha ao processar pagamento');
      }

      logger.info('🔄 Refazendo fetch após pagamento...');
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

      return {
        creditAccount: { ...creditAccount, balance: data.credit_balance?.[0]?.new_balance || creditAccount.balance },
        bankAccount: { ...bankAccount, balance: data.debit_balance?.[0]?.new_balance || bankAccount.balance },
      };
    } catch (error: unknown) {
      logger.error('Error processing credit payment:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro no pagamento',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, accounts, queryClient, toast]);

  const handleReversePayment = useCallback(async (paymentsToReverse: Transaction[]) => {
    if (!user || !paymentsToReverse || paymentsToReverse.length === 0) {
      toast({ title: 'Nenhum pagamento para estornar', variant: 'destructive' });
      return;
    }

    toast({ title: 'Estornando pagamento...' });

    try {
      const results = await Promise.all(
        paymentsToReverse.map(payment => 
          supabase.functions.invoke('atomic-delete-transaction', {
            body: {
              transaction_id: payment.id,
              scope: 'current',
            }
          })
        )
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw errors[0].error;

      logger.info('🔄 Refazendo fetch após estorno...');
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

      toast({ title: 'Pagamento estornado com sucesso!' });
    } catch (error: unknown) {
      logger.error('Erro ao estornar pagamento:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro ao estornar',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [user, queryClient, toast]);

  return {
    handleCreditPayment,
    handleReversePayment,
  };
}
