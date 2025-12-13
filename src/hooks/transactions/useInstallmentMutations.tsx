import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { InstallmentTransactionInput } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

export function useInstallmentMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAddInstallmentTransactions = useCallback(async (transactionsData: InstallmentTransactionInput[]) => {
    if (!user) return;
    try {
      const totalInstallments = transactionsData.length;

      const results = await Promise.all(
        transactionsData.map(async (data, index) => {
          const dateStr = data.date.toISOString().split('T')[0];
          logger.debug(`Criando parcela ${index + 1}/${totalInstallments}:`, {
            description: data.description,
            originalDate: data.date.toISOString(),
            dateStr,
            currentInstallment: data.currentInstallment
          });
          
          const { data: rpcData, error } = await supabase.rpc('atomic_create_transaction', {
            p_user_id: user.id,
            p_description: data.description,
            p_amount: data.amount,
            p_date: dateStr,
            p_type: data.type,
            p_category_id: data.category_id,
            p_account_id: data.account_id,
            p_status: data.status,
            p_invoice_month: data.invoiceMonth ?? undefined,
            p_invoice_month_overridden: data.invoiceMonthOverridden ?? false,
          });

          if (error) {
            return { data: null, error };
          }

          const record = rpcData && Array.isArray(rpcData) ? rpcData[0] as { transaction_id?: string; success?: boolean; error_message?: string } : null;

          if (!record || record.success === false) {
            const err = new Error(record?.error_message || 'Erro ao criar transação parcelada');
            return { data: null, error: err };
          }

          return {
            data: {
              transaction: { id: record.transaction_id },
            },
            error: null,
          };
        })
      );

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        const firstError = errors[0].error;
        const errorMessage = getErrorMessage(firstError);
        
        if (errorMessage.includes('Credit limit exceeded')) {
          const match = errorMessage.match(/Available: ([\d.-]+).*Limit: ([\d.]+).*Used: ([\d.]+).*Requested: ([\d.]+)/);
          
          let friendlyMessage = 'Limite do cartão de crédito excedido ao criar parcelas. ';
          if (match) {
            const available = (parseFloat(match[1]) / 100).toFixed(2);
            const limit = (parseFloat(match[2]) / 100).toFixed(2);
            const used = (parseFloat(match[3]) / 100).toFixed(2);
            const requested = (parseFloat(match[4]) / 100).toFixed(2);
            
            friendlyMessage += `Disponível: R$ ${available} | Limite: R$ ${limit} | Usado: R$ ${used} | Solicitado por parcela: R$ ${requested}`;
          } else {
            friendlyMessage += 'Reduza o número de parcelas, o valor ou aumente o limite do cartão.';
          }
          
          toast({
            title: 'Limite de crédito excedido',
            description: friendlyMessage,
            variant: 'destructive',
          });
          return;
        }
        throw firstError;
      }

      const createdIds = results
        .map((r) => {
          const transactionData = r.data as Record<string, unknown> | null;
          return transactionData?.transaction as { id?: string } | undefined;
        })
        .filter((t): t is { id: string } => t !== undefined && typeof t.id === 'string')
        .map(t => t.id);

      if (createdIds.length !== totalInstallments) {
        logger.error('Mismatch between installments created and expected', {
          expected: totalInstallments,
          created: createdIds.length,
        });
        throw new Error('Erro ao registrar metadados das parcelas');
      }

      const parentId = createdIds[0];

      const updatePromises = createdIds.map((id, index) => 
        supabase
          .from('transactions')
          .update({
            installments: totalInstallments,
            current_installment: index + 1,
            parent_transaction_id: parentId,
          })
          .eq('id', id)
      );

      const updateResults = await Promise.all(updatePromises);
      const updateErrors = updateResults.filter(r => r.error);
      
      if (updateErrors.length > 0) {
        logger.error('Error updating installment metadata:', updateErrors[0].error);
        throw updateErrors[0].error;
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    } catch (error: unknown) {
      logger.error('Error adding installment transactions:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro ao criar parcelas',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  return {
    handleAddInstallmentTransactions,
  };
}
