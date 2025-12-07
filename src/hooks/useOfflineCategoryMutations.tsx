import { useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';
import { Category } from '@/types';

export function useOfflineCategoryMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const processOfflineAdd = useCallback(async (categoryData: any) => {
    try {
      const tempId = `temp-${Date.now()}`;
      const newCategory: Category = {
        id: tempId,
        user_id: user?.id || 'offline-user',
        name: categoryData.name,
        type: categoryData.type,
        color: categoryData.color || '#6b7280',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'add_category',
        data: { ...categoryData, id: tempId }, // Include temp ID for mapping
      });

      // 2. Update local DB (Optimistic UI)
      await offlineDatabase.saveCategories([newCategory]);

      // 3. Update React Query Cache
      queryClient.setQueryData<Category[]>(queryKeys.categories, (old) => {
        return [...(old || []), newCategory].sort((a, b) => a.name.localeCompare(b.name));
      });

      toast({
        title: 'Categoria criada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category add queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category add:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a categoria offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleAddCategory = useCallback(async (categoryData: {
    name: string;
    type: 'income' | 'expense' | 'both';
    color?: string;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .insert({
            name: categoryData.name,
            type: categoryData.type,
            color: categoryData.color || '#6b7280',
            user_id: user.id,
          });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria criada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during category creation, falling back to offline mode');
          await processOfflineAdd(categoryData);
          return;
        }

        logger.error('Error adding category:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao criar categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineAdd(categoryData);
  }, [isOnline, user, queryClient, toast, processOfflineAdd]);

  const processOfflineEdit = useCallback(async (categoryId: string, categoryData: any) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'edit_category',
        data: {
          category_id: categoryId,
          updates: categoryData,
        }
      });

      // 2. Update local DB (Optimistic UI)
      const existingCategories = await offlineDatabase.getCategories(user?.id || '');
      const categoryToUpdate = existingCategories.find(c => c.id === categoryId);
      
      if (categoryToUpdate) {
        const updatedCategory = { ...categoryToUpdate, ...categoryData, updated_at: new Date().toISOString() };
        await offlineDatabase.saveCategories([updatedCategory]);

        // 3. Update React Query Cache
        queryClient.setQueryData<Category[]>(queryKeys.categories, (old) => {
          if (!old) return old;
          return old.map(cat => cat.id === categoryId ? updatedCategory : cat);
        });
      }

      toast({
        title: 'Edição registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditCategory = useCallback(async (categoryId: string, categoryData: {
    name?: string;
    type?: 'income' | 'expense' | 'both';
    color?: string;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .update(categoryData)
          .eq('id', categoryId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria atualizada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during category update, falling back to offline mode');
          await processOfflineEdit(categoryId, categoryData);
          return;
        }

        logger.error('Error updating category:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao atualizar categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineEdit(categoryId, categoryData);
  }, [isOnline, user, queryClient, toast, processOfflineEdit]);

  const processOfflineDelete = useCallback(async (categoryId: string) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'delete_category',
        data: {
          category_id: categoryId,
        }
      });

      // 2. Update React Query Cache (Optimistic UI)
      queryClient.setQueryData<Category[]>(queryKeys.categories, (old) => {
        if (!old) return old;
        return old.filter(cat => cat.id !== categoryId);
      });

      toast({
        title: 'Exclusão registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [queryClient, toast]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria excluída com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during category deletion, falling back to offline mode');
          await processOfflineDelete(categoryId);
          return;
        }

        logger.error('Error deleting category:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao excluir categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineDelete(categoryId);
  }, [isOnline, user, queryClient, toast, processOfflineDelete]);

  const handleImportCategories = useCallback(async (categoriesData: any[], categoriesToReplace: string[] = []) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // Deletar categorias que serão substituídas
        if (categoriesToReplace.length > 0) {
          const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .in('id', categoriesToReplace)
            .eq('user_id', user.id);

          if (deleteError) throw deleteError;
        }

        // Inserir novas categorias
        const categoriesToAdd = categoriesData.map(cat => ({
          name: cat.name,
          type: cat.type,
          color: cat.color || '#6b7280',
          user_id: user.id,
        }));

        const { error } = await supabase
          .from('categories')
          .insert(categoriesToAdd);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: `${categoriesToAdd.length} categorias importadas com sucesso`,
        });
      } catch (error: unknown) {
        logger.error('Error importing categories:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao importar categorias',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue import categories operation
    try {
      await offlineQueue.enqueue({
        type: 'import_categories',
        data: {
          categories: categoriesData,
          replace_ids: categoriesToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Categories import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue categories import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  return {
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleImportCategories,
  };
}
