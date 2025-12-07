import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Category } from "@/types";
import { logger } from "@/lib/logger";
import { queryKeys } from '@/lib/queryClient';

export function useCategories() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, type, color, created_at, updated_at')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
        
      if (error) {
        logger.error('Error loading categories:', error);
        throw error;
      }
      
      return (data || []) as Category[];
    },
    enabled: !!user,
    // Categorias são dados relativamente estáveis
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 15 * 60 * 1000, // 15 minutos
    // Refetch only when stale
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Categorias não mudam com tanta frequência
  });

  return {
    categories: query.data || [],
    loading: query.isLoading,
    refetch: query.refetch
  };
}