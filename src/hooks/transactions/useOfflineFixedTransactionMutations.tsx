import { useCallback } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';

export function useOfflineFixedTransactionMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const processOfflineAdd = useCallback(async (transactionData: any) => {
    try {
      await offlineQueue.enqueue({
        type: 'add_fixed_transaction',
        data: transactionData,
      });

      toast({
        title: 'Transação fixa registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a transação fixa offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const handleAddFixedTransaction = useCallback(async (transactionData: {
    description: string;
    amount: number;
    date: string;
    type: 'income' | 'expense';
    category_id: string;
    account_id: string;
    status: 'pending' | 'completed';
  }) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { data, error } = await supabase.functions.invoke('atomic-create-fixed', {
          body: {
            transaction: transactionData,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa criada com sucesso',
        });

        return data;
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during fixed transaction creation, falling back to offline mode');
          await processOfflineAdd(transactionData);
          return;
        }

        logger.error('Error adding fixed transaction:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao criar transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineAdd(transactionData);
  }, [isOnline, user, queryClient, toast, processOfflineAdd]);

  const processOfflineEdit = useCallback(async (transactionId: string, updates: any, scope: any) => {
    try {
      await offlineQueue.enqueue({
        type: 'edit',
        data: {
          transaction_id: transactionId,
          updates,
          scope,
        }
      });

      toast({
        title: 'Edição registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const handleEditFixedTransaction = useCallback(async (
    transactionId: string,
    updates: any,
    scope: 'current' | 'current-and-remaining' | 'all' = 'current'
  ) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
          body: {
            transaction_id: transactionId,
            updates,
            scope,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa atualizada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during fixed transaction update, falling back to offline mode');
          await processOfflineEdit(transactionId, updates, scope);
          return;
        }

        logger.error('Error editing fixed transaction:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao editar transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineEdit(transactionId, updates, scope);
  }, [isOnline, user, queryClient, toast, processOfflineEdit]);

  const processOfflineDelete = useCallback(async (transactionId: string, scope: any) => {
    try {
      await offlineQueue.enqueue({
        type: 'delete',
        data: {
          transaction_id: transactionId,
          scope,
        }
      });

      toast({
        title: 'Exclusão registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const handleDeleteFixedTransaction = useCallback(async (
    transactionId: string,
    scope: 'current' | 'current-and-remaining' | 'all' = 'current'
  ) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { error } = await supabase.functions.invoke('atomic-delete-transaction', {
          body: {
            transaction_id: transactionId,
            scope,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa excluída com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during fixed transaction deletion, falling back to offline mode');
          await processOfflineDelete(transactionId, scope);
          return;
        }

        logger.error('Error deleting fixed transaction:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao excluir transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineDelete(transactionId, scope);
  }, [isOnline, user, queryClient, toast, processOfflineDelete]);

  return {
    handleAddFixedTransaction,
    handleEditFixedTransaction,
    handleDeleteFixedTransaction,
  };
}
