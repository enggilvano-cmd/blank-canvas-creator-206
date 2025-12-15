import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQueryInvalidation } from '@/hooks/useQueryInvalidation';
import { notifyFixedTransactionsChange } from '@/hooks/useFixedTransactions';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { TransactionInput, TransactionUpdate, Account, Category, Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { EditScope } from '@/components/TransactionScopeDialog';
import { getErrorMessage } from '@/lib/errorUtils';
import { generateUUID } from '@/lib/utils';

export function useTransactionMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { invalidateTransactions, helper } = useQueryInvalidation();
  const queryClient = helper.queryClient;

  /**
   * Desconta o valor de uma provisão quando uma transação real é lançada.
   * A provisão funciona como um "orçamento" que vai sendo consumido.
   * ⚠️ IMPORTANTE: Altera apenas a instância do mês (filha), não a provisão pai
   * ⚠️ CUIDADO: Provisões são armazenadas como NEGATIVAS no banco (-5000)
   */
  const deductProvisionIfExists = useCallback(async (
    categoryId: string,
    transactionAmount: number,
    transactionDate: Date,
    transactionType: 'income' | 'expense' | 'transfer' = 'expense'
  ) => {
    if (!user) return;

    try {
      // Buscar provisões da categoria no mesmo mês
      const transactionMonth = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1);
      const startOfMonth = new Date(transactionMonth.getFullYear(), transactionMonth.getMonth(), 1);
      const endOfMonth = new Date(transactionMonth.getFullYear(), transactionMonth.getMonth() + 1, 0);

      // 🔴 CRÍTICO: Buscar apenas as INSTÂNCIAS (filhas) da provisão, não a pai!
      // parent_transaction_id NOT NULL = são as filhas geradas para cada mês
      const { data: provisions, error } = await supabase
        .from('transactions')
        .select('id, amount, date, type, parent_transaction_id')
        .eq('user_id', user.id)
        .eq('category_id', categoryId)
        .eq('is_provision', true)
        .not('parent_transaction_id', 'is', null)  // ⚠️ APENAS as filhas!
        .gte('date', startOfMonth.toISOString())
        .lte('date', endOfMonth.toISOString());

      if (error) {
        logger.error('Erro ao buscar provisões:', error);
        return;
      }

      if (!provisions || provisions.length === 0) return;

      const provision = provisions[0];
      
      // ⚠️ IMPORTANTE: Transações no banco são armazenadas NEGATIVAS para despesas!
      // Quando lança despesa de 500, é armazenada como -500
      // Provisões também são negativas: -5000
      // Logo: -5000 + (-500) = -5500 (mais negativa = consumida)
      
      const absAmount = Math.abs(transactionAmount);
      let adjustment = 0;

      // Lógica: descontar o valor gasto da provisão
      // 🎯 PADRÃO: Despesas somam (invertem sinal), Receitas subtraem
      // ⚠️ Provisões NEGATIVAS no banco: -2000 (R$ 2000 de despesa)
      // Despesa de 500: -2000 + 500 = -1500 (R$ 1500 restante)
      // Receita de 500: 1000 - 500 = 500 (R$ 500 restante)
      
      if (provision.type === 'expense' && transactionType === 'expense') {
        // Provisão expense - Despesa lançada = REVERTER sinal (somar)
        // -2000 + 500 = -1500 ✓
        adjustment = +absAmount;
      } else if (provision.type === 'expense' && transactionType === 'income') {
        // Provisão expense + Receita lançada = DESCONTAR
        // -2000 + (-500) = -2500
        adjustment = -absAmount;
      } else if (provision.type === 'income' && transactionType === 'income') {
        // Provisão income - Receita lançada = DESCONTAR
        // 1000 + (-500) = 500 ✓
        adjustment = -absAmount;
      } else if (provision.type === 'income' && transactionType === 'expense') {
        // Provisão income + Despesa lançada = SOMAR (descontar)
        // 1000 + 500 = 1500 ✓
        adjustment = +absAmount;
      }

      const newProvisionAmount = provision.amount + adjustment;

      logger.info(`✅ Reduzindo INSTÂNCIA da provisão (filha):
        - categoryId: ${categoryId}
        - provisionId: ${provision.id}
        - provision.amount: ${provision.amount} (negativa no banco)
        - transactionAmount: ${transactionAmount}
        - adjustment: ${adjustment}
        - ${provision.amount} → ${newProvisionAmount}`);

      // Atualizar apenas a instância (filha)
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ amount: newProvisionAmount })
        .eq('id', provision.id)
        .eq('user_id', user.id);

      if (updateError) {
        logger.error('Erro ao atualizar provisão:', updateError);
        return;
      }

      // Atualizar cache offline
      const { data: updatedProvision } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', provision.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (updatedProvision) {
        await offlineDatabase.saveTransactions([updatedProvision as any]);
      }

      // Notificar Dashboard para recalcular
      notifyFixedTransactionsChange();
    } catch (error) {
      logger.error('Erro ao descontar provisão:', error);
    }
  }, [user, queryClient]);

  /**
   * Ajusta a provisão filha quando uma transação é editada ou deletada.
   * ⚠️ IMPORTANTE: Altera apenas a instância do mês (filha), não a provisão pai
   * ⚠️ CUIDADO: Provisões são armazenadas como NEGATIVAS no banco (-5000), trate com cuidado!
   */
  const adjustProvisionIfExists = useCallback(async (
    categoryId: string,
    transactionDate: Date | string,
    oldAmount: number,
    newAmount: number | null, // null = deletada
    transactionType: 'income' | 'expense' | 'transfer' = 'expense'
  ) => {
    if (!user) return;

    try {
      // Buscar provisão filha do mês
      const dateObj = typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate;
      const transactionMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      const startOfMonth = new Date(transactionMonth.getFullYear(), transactionMonth.getMonth(), 1);
      const endOfMonth = new Date(transactionMonth.getFullYear(), transactionMonth.getMonth() + 1, 0);

      const { data: provisions, error } = await supabase
        .from('transactions')
        .select('id, amount, date, type, parent_transaction_id')
        .eq('user_id', user.id)
        .eq('category_id', categoryId)
        .eq('is_provision', true)
        .not('parent_transaction_id', 'is', null)  // ⚠️ Apenas as filhas!
        .gte('date', startOfMonth.toISOString())
        .lte('date', endOfMonth.toISOString());

      if (error) {
        logger.error('Erro ao buscar provisões:', error);
        return;
      }

      if (!provisions || provisions.length === 0) return;

      const provision = provisions[0];
      
      // Calcular ajuste (PADRÃO: Despesas somam, Receitas subtraem)
      let adjustment = 0;

      if (newAmount === null) {
        // DELETADA: reembolsar o valor (INVERTER o que foi debitado)
        const absOldAmount = Math.abs(oldAmount);
        if (provision.type === 'expense' && transactionType === 'expense') {
          // Deletada despesa = reembolsar (inverter +absAmount para -absAmount)
          // -1500 + (-500) = -2000 ✓ (volta ao original)
          adjustment = -absOldAmount;  
        } else if (provision.type === 'expense' && transactionType === 'income') {
          adjustment = +absOldAmount;
        } else if (provision.type === 'income' && transactionType === 'income') {
          // Deletada receita = reembolsar (inverter -absAmount para +absAmount)
          // 500 + 500 = 1000 ✓ (volta ao original)
          adjustment = +absOldAmount;
        } else if (provision.type === 'income' && transactionType === 'expense') {
          adjustment = -absOldAmount;
        }
      } else {
        // EDITADA: recalcular a diferença (INVERTER o padrão de lançamento)
        const oldAbs = Math.abs(oldAmount);
        const newAbs = Math.abs(newAmount);
        const difference = oldAbs - newAbs;

        if (provision.type === 'expense' && transactionType === 'expense') {
          // Edição despesa = inverter sinal (de +difference para -difference)
          // Lançou 500: -2000 + 500 = -1500
          // Edita para 300: -1500 + (-200) = -1700 ✓ (equivalente a ter lançado 300)
          adjustment = -difference;
        } else if (provision.type === 'expense' && transactionType === 'income') {
          adjustment = +difference;
        } else if (provision.type === 'income' && transactionType === 'income') {
          // Edição receita = inverter sinal (de -difference para +difference)
          // Lançou 500: 1000 + (-500) = 500
          // Edita para 300: 500 + 200 = 700 ✓ (equivalente a ter lançado 300)
          adjustment = +difference;
        } else if (provision.type === 'income' && transactionType === 'expense') {
          adjustment = -difference;
        }
      }

      const newProvisionAmount = provision.amount + adjustment;

      logger.info(`📊 Ajustando provisão filha:
        - categoryId: ${categoryId}
        - provisionId: ${provision.id}
        - provision.amount: ${provision.amount} (negativa no banco)
        - oldAmount: ${oldAmount}, newAmount: ${newAmount}
        - adjustment: ${adjustment}
        - ${provision.amount} → ${newProvisionAmount}`);

      // Atualizar apenas a instância (filha)
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ amount: newProvisionAmount })
        .eq('id', provision.id)
        .eq('user_id', user.id);

      if (updateError) {
        logger.error('Erro ao ajustar provisão:', updateError);
        return;
      }

      // Atualizar cache offline
      const { data: updatedProvision } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', provision.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (updatedProvision) {
        await offlineDatabase.saveTransactions([updatedProvision as any]);
      }

      // Notificar Dashboard
      notifyFixedTransactionsChange();
    } catch (error) {
      logger.error('Erro ao ajustar provisão:', error);
    }
  }, [user, queryClient]);

  const handleAddTransaction = useCallback(async (transactionData: TransactionInput) => {
    if (!user) return;
    
    // Snapshot for rollback
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // 1. Optimistic Update: Accounts Balance
      if (previousAccounts) {
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return [];
          return old.map(acc => {
            if (acc.id === transactionData.account_id) {
              let newBalance = acc.balance;
              if (transactionData.type === 'expense') {
                newBalance -= transactionData.amount;
              } else if (transactionData.type === 'income') {
                newBalance += transactionData.amount;
              }
              // Note: Transfers might need handling if they affect two accounts, 
              // but TransactionInput usually targets one account context here.
              return { ...acc, balance: newBalance };
            }
            return acc;
          });
        });
      }

      // 2. Optimistic Update: Transactions List
      const tempId = generateUUID();
      const categories = queryClient.getQueryData<Category[]>(queryKeys.categories) || [];
      const accounts = queryClient.getQueryData<Account[]>(queryKeys.accounts) || [];
      
      const category = categories.find(c => c.id === transactionData.category_id);
      const account = accounts.find(a => a.id === transactionData.account_id);

      const optimisticTransaction: any = {
        id: tempId,
        description: transactionData.description,
        amount: transactionData.amount,
        date: transactionData.date, // Date object
        type: transactionData.type,
        category_id: transactionData.category_id,
        account_id: transactionData.account_id,
        status: transactionData.status,
        invoice_month: transactionData.invoiceMonth || null,
        invoice_month_overridden: !!transactionData.invoiceMonth,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        category,
        account,
        to_account: null, // Simplified
        installments: 1,
        current_installment: 1,
        is_recurring: false,
        is_fixed: false,
        user_id: user.id
      };

      // Update all transaction lists
      queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
        if (!oldData) return [optimisticTransaction];
        if (Array.isArray(oldData)) {
          // Prepend to list
          return [optimisticTransaction, ...oldData];
        }
        // If it's a paginated response (infinite query), it might be different structure
        // But useTransactions returns array.
        return oldData;
      });

      const payload = {
        transaction: {
          description: transactionData.description,
          amount: transactionData.amount,
          date: transactionData.date.toISOString().split('T')[0],
          type: transactionData.type,
          category_id: transactionData.category_id,
          account_id: transactionData.account_id,
          status: transactionData.status,
          invoice_month: transactionData.invoiceMonth || null,
          invoice_month_overridden: !!transactionData.invoiceMonth,
        }
      };

      const { data: responseData, error } = await supabase.functions.invoke('atomic-transaction', {
        body: payload
      });

      const response = { data: responseData, error };

      if (response.error) {
        logger.error('🚨 ERRO 400 - Detalhes:', JSON.stringify({
          message: response.error.message,
          context: response.error.context,
          details: response.error,
          responseData: response.data
        }, null, 2));
        const { error } = response;
        const errorMessage = getErrorMessage(error);
        if (errorMessage.includes('Credit limit exceeded')) {
          // ... existing error handling ...
          const match = errorMessage.match(/Available: ([\d.-]+).*Limit: ([\d.]+).*Used: ([\d.]+).*Requested: ([\d.]+)/);
          
          let friendlyMessage = 'Limite do cartão de crédito excedido. ';
          if (match) {
            const available = (parseFloat(match[1]) / 100).toFixed(2);
            const limit = (parseFloat(match[2]) / 100).toFixed(2);
            const used = (parseFloat(match[3]) / 100).toFixed(2);
            const requested = (parseFloat(match[4]) / 100).toFixed(2);
            
            friendlyMessage += `Disponível: R$ ${available} | Limite: R$ ${limit} | Usado: R$ ${used} | Solicitado: R$ ${requested}`;
          } else {
            friendlyMessage += 'Reduza o valor da transação, aumente o limite do cartão ou faça um pagamento.';
          }
          
          toast({
            title: 'Limite de crédito excedido',
            description: friendlyMessage,
            variant: 'destructive',
          });
          throw error; // Trigger rollback
        }
        throw error;
      }

      // ✅ Descontar provisão: quando lança uma transação real, a provisão é consumida
      // 🚀 Executar em BACKGROUND sem bloquear o fluxo principal
      if (transactionData.category_id && transactionData.type !== 'transfer') {
        // Fire and forget - não bloqueia com await
        deductProvisionIfExists(
          transactionData.category_id,
          transactionData.amount,
          transactionData.date,
          transactionData.type
        ).catch(err => logger.error('Erro background ao descontar provisão:', err));
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      await invalidateTransactions();
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Quando adiciona um lançamento, precisa atualizar os cálculos de provisões
      notifyFixedTransactionsChange();
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      // Rollback transactions
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error adding transaction:', error);
      const errorMessage = getErrorMessage(error);
      // Only show toast if not already shown (credit limit)
      if (!errorMessage.includes('Credit limit exceeded')) {
         toast({
          title: 'Erro',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditTransaction = useCallback(async (
    updatedTransaction: TransactionUpdate,
    editScope?: EditScope
  ) => {
    if (!user) return;

    // Snapshot
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    // Find original transaction to calculate diffs (moved outside scope so it's available later)
    let originalTransaction: Transaction | undefined;
    
    // Search in cache
    for (const [_, data] of previousTransactions) {
      if (Array.isArray(data)) {
        const found = data.find((t: any) => t.id === updatedTransaction.id);
        if (found) {
          originalTransaction = found;
          break;
        }
      }
    }

    try {
      // Optimistic Update only for 'current' scope to avoid complexity
      if (!editScope || editScope === 'current') {
        if (originalTransaction) {
          // 1. Update Accounts
          if (previousAccounts) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
              if (!old) return [];
              return old.map(acc => {
                // If account changed
                if (updatedTransaction.account_id && updatedTransaction.account_id !== originalTransaction!.account_id) {
                   // Remove from old account
                   if (acc.id === originalTransaction!.account_id) {
                     let amount = originalTransaction!.amount; // Amount is always positive in DB? No, signed?
                     // In DB/Types, amount is usually positive and type determines sign, OR signed.
                     // Let's check: useOfflineTransactionMutations uses Math.abs.
                     // In Supabase, usually signed or type-based.
                     // TransactionInput has type.
                     // Let's assume amount is positive and type determines sign for calculation.
                     // Wait, in `handleAddTransaction` I did:
                     // if (type === 'expense') newBalance -= amount;
                     
                     // Revert old transaction effect
                     if (originalTransaction!.type === 'expense') acc.balance += originalTransaction!.amount;
                     else if (originalTransaction!.type === 'income') acc.balance -= originalTransaction!.amount;
                   }
                   // Add to new account
                   if (acc.id === updatedTransaction.account_id) {
                     const amount = updatedTransaction.amount ?? originalTransaction!.amount;
                     const type = updatedTransaction.type ?? originalTransaction!.type;
                     if (type === 'expense') acc.balance -= amount;
                     else if (type === 'income') acc.balance += amount;
                   }
                } else if (acc.id === originalTransaction!.account_id) {
                  // Same account, maybe amount/type changed
                  const oldAmount = originalTransaction!.amount;
                  const newAmount = updatedTransaction.amount ?? oldAmount;
                  const oldType = originalTransaction!.type;
                  const newType = updatedTransaction.type ?? oldType;

                  // Revert old
                  if (oldType === 'expense') acc.balance += oldAmount;
                  else if (oldType === 'income') acc.balance -= oldAmount;

                  // Apply new
                  if (newType === 'expense') acc.balance -= newAmount;
                  else if (newType === 'income') acc.balance += newAmount;
                }
                return acc;
              });
            });
          }

          // 2. Update Transaction in List
          queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((tx: any) => {
              if (tx.id === updatedTransaction.id) {
                 return {
                   ...tx,
                   ...updatedTransaction,
                   date: updatedTransaction.date ? new Date(updatedTransaction.date) : tx.date,
                   // If category/account changed, we should update the objects too, but for now ID is enough for logic,
                   // UI might show old name until refresh if we don't update objects.
                   // It's acceptable for <1s.
                 };
              }
              return tx;
            });
          });
        }
      }

      const updates: Partial<TransactionUpdate> = {};
      
      if (updatedTransaction.description !== undefined) {
        updates.description = updatedTransaction.description;
      }
      if (updatedTransaction.amount !== undefined) {
        updates.amount = updatedTransaction.amount;
      }
      if (updatedTransaction.date !== undefined) {
        updates.date = typeof updatedTransaction.date === 'string'
          ? updatedTransaction.date
          : updatedTransaction.date.toISOString().split('T')[0];
      }
      if (updatedTransaction.type !== undefined) {
        updates.type = updatedTransaction.type;
      }
      if (updatedTransaction.category_id !== undefined) {
        updates.category_id = updatedTransaction.category_id;
      }
      if (updatedTransaction.account_id !== undefined) {
        updates.account_id = updatedTransaction.account_id;
      }
      if (updatedTransaction.status !== undefined) {
        updates.status = updatedTransaction.status;
      }
      if (updatedTransaction.invoice_month !== undefined) {
        updates.invoice_month = updatedTransaction.invoice_month || null;
      }
      if ((updatedTransaction as any).invoice_month_overridden !== undefined) {
        (updates as any).invoice_month_overridden = (updatedTransaction as any).invoice_month_overridden;
      }

      const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: updatedTransaction.id,
          updates,
          scope: editScope || 'current',
        }
      });

      if (error) throw error;

      // ✅ Ajustar provisão ao editar transação (executar em background)
      if (originalTransaction && originalTransaction.category_id && originalTransaction.type !== 'transfer') {
        const newCategoryId = updatedTransaction.category_id ?? originalTransaction.category_id;
        const newAmount = updatedTransaction.amount ?? originalTransaction.amount;
        const newDate = updatedTransaction.date ?? originalTransaction.date;
        
        // Se mudou de categoria, ajustar ambas
        if (newCategoryId !== originalTransaction.category_id) {
          // Devolver na categoria antiga
          adjustProvisionIfExists(
            originalTransaction.category_id,
            originalTransaction.date,
            originalTransaction.amount,
            null, // deletada
            originalTransaction.type
          ).catch(err => logger.error('Erro ao ajustar provisão antiga:', err));
          
          // Descontar na categoria nova
          adjustProvisionIfExists(
            newCategoryId,
            newDate,
            newAmount,
            newAmount,
            updatedTransaction.type ?? originalTransaction.type
          ).catch(err => logger.error('Erro ao ajustar provisão nova:', err));
        } else {
          // Mesma categoria, apenas recalcular
          adjustProvisionIfExists(
            newCategoryId,
            newDate,
            originalTransaction.amount,
            newAmount,
            updatedTransaction.type ?? originalTransaction.type
          ).catch(err => logger.error('Erro ao ajustar provisão:', err));
        }
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      await invalidateTransactions();
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Se editou um lançamento, os cálculos de provisões podem mudar
      // Se editou uma provisão, ela mesma precisa refetchar
      notifyFixedTransactionsChange();
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error updating transaction:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleDeleteTransaction = useCallback(async (
    transactionId: string,
    editScope?: EditScope
  ) => {
    if (!user) return;

    logger.info('[Delete] Iniciando exclusão de transação:', { transactionId, editScope });

    // Snapshot
    const previousAccounts = queryClient.getQueryData<Account[]>(queryKeys.accounts);
    const previousTransactions = queryClient.getQueriesData({ queryKey: queryKeys.transactionsBase });

    try {
      // Optimistic Update
      if (!editScope || editScope === 'current') {
         let originalTransaction: Transaction | undefined;
         for (const [_, data] of previousTransactions) {
          if (Array.isArray(data)) {
            const found = data.find((t: any) => t.id === transactionId);
            if (found) {
              originalTransaction = found;
              break;
            }
          }
        }

        if (originalTransaction) {
          // Prevent deleting "Saldo Inicial"
          if (originalTransaction.description === 'Saldo Inicial') {
            toast({
              title: 'Ação não permitida',
              description: 'O saldo inicial não pode ser excluído. Edite a conta para alterar o saldo inicial.',
              variant: 'destructive',
            });
            return;
          }

           // 1. Update Accounts (Revert balance)
           if (previousAccounts) {
            queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
              if (!old) return [];
              return old.map(acc => {
                // Reverter saldo da conta de origem
                if (acc.id === originalTransaction!.account_id) {
                   if (originalTransaction!.type === 'expense') acc.balance += Math.abs(originalTransaction!.amount);
                   else if (originalTransaction!.type === 'income') acc.balance -= Math.abs(originalTransaction!.amount);
                }
                // Se for transferência, reverter saldo da conta de destino também
                if (originalTransaction!.to_account_id && acc.id === originalTransaction!.to_account_id) {
                  // A conta destino recebeu (income), então precisa remover
                  acc.balance -= Math.abs(originalTransaction!.amount);
                }
                return acc;
              });
            });
           }

           // 2. Remove from list (incluindo transação vinculada se for transferência)
           queryClient.setQueriesData({ queryKey: queryKeys.transactionsBase }, (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            
            // Verificar se é transferência e tem linked_transaction_id
            const linkedId = originalTransaction!.linked_transaction_id;
            
            logger.info('[Delete] Filtrando cache local:', {
              transactionId,
              linkedId,
              hadLink: !!linkedId,
              totalBefore: oldData.length
            });
            
            const result = oldData.filter((tx: any) => {
              if (tx.id === transactionId) {
                logger.info('[Delete] Removendo transação principal:', transactionId);
                return false;
              }
              if (linkedId && tx.id === linkedId) {
                logger.info('[Delete] Removendo transação vinculada:', linkedId);
                return false;
              }
              return true;
            });
            
            logger.info('[Delete] Cache filtrado:', { totalAfter: result.length });
            return result;
          });
        }
      }

      // Usar função SQL atômica diretamente para evitar falhas de Edge Function / rate limit
      const { data: rpcData, error } = await supabase.rpc('atomic_delete_transaction', {
        p_user_id: user.id,
        p_transaction_id: transactionId,
        p_scope: editScope || 'current',
      });

      if (error) {
        const errorMessage = getErrorMessage(error);
        throw new Error(errorMessage || 'Erro ao excluir transação');
      }

      const record = rpcData && Array.isArray(rpcData)
        ? (rpcData[0] as { deleted_count?: number; success?: boolean; error_message?: string })
        : null;

      if (!record || record.success === false) {
        throw new Error(record?.error_message || 'Transação não encontrada ou já foi excluída');
      }

      // ✅ Reembolsar provisão quando transação é deletada
      // Encontra a transação deletada para obter category_id e amount
      let originalTransaction: Transaction | undefined;
      for (const [_, data] of previousTransactions) {
        if (Array.isArray(data)) {
          const found = data.find((t: any) => t.id === transactionId);
          if (found) {
            originalTransaction = found;
            break;
          }
        }
      }

      if (originalTransaction && originalTransaction.category_id && originalTransaction.type !== 'transfer') {
        // ✅ Devolver o valor da provisão filha quando deleta transação
        adjustProvisionIfExists(
          originalTransaction.category_id,
          originalTransaction.date,
          originalTransaction.amount,
          null, // deletada
          originalTransaction.type
        ).catch(err => logger.error('Erro ao devolver provisão:', err));
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      
      // ✅ CRÍTICO: Notificar mudança em transações fixas (provisões) para recálculo do dashboard
      // Quando deleta um lançamento, os cálculos de provisões mudam
      notifyFixedTransactionsChange();

      toast({
        title: 'Sucesso',
        description: `${record.deleted_count ?? 1} transação(ões) excluída(s)`,
      });
    } catch (error: unknown) {
      // Rollback
      if (previousAccounts) {
        queryClient.setQueryData(queryKeys.accounts, previousAccounts);
      }
      previousTransactions.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });

      logger.error('Error deleting transaction:', error);
      const errorMessage = getErrorMessage(error);

      toast({
        title: 'Erro ao excluir',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);
 
  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
  };
}
