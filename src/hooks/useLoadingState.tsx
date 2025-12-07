import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/types/errors';

/**
 * Custom hook for managing loading states in async operations
 * Provides consistent loading feedback and error handling
 */
export function useLoadingState() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const withLoading = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      options?: {
        loadingMessage?: string;
        successMessage?: string;
        errorMessage?: string;
        showToastOnSuccess?: boolean;
        showToastOnError?: boolean;
      }
    ): Promise<T | null> => {
      const {
        loadingMessage,
        successMessage,
        errorMessage = 'Erro ao executar operação',
        showToastOnSuccess = false,
        showToastOnError = true,
      } = options || {};

      try {
        setIsLoading(true);

        if (loadingMessage) {
          toast({
            title: loadingMessage,
          });
        }

        const result = await operation();

        if (showToastOnSuccess && successMessage) {
          toast({
            title: 'Sucesso',
            description: successMessage,
          });
        }

        return result;
      } catch (error) {
        logger.error('Error in async operation:', error);

        if (showToastOnError) {
          toast({
            title: 'Erro',
            description: `${errorMessage}: ${getErrorMessage(error)}`,
            variant: 'destructive',
          });
        }

        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  return {
    isLoading,
    withLoading,
  };
}
