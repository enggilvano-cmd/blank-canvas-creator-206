import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { validateFormData, formatZodErrors } from '@/lib/formValidation';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

/**
 * ✅ PRIORITY HIGH: Wrapper for mutations with runtime validation
 * 
 * This hook adds automatic Zod validation to mutations, ensuring
 * data integrity before it reaches the database.
 * 
 * Usage:
 * ```tsx
 * const mutation = useValidatedMutation({
 *   schema: transactionFormSchema,
 *   mutationFn: async (data) => {
 *     // data is already validated here
 *     return await supabase.from('transactions').insert(data);
 *   },
 *   onSuccess: () => {
 *     toast.success('Transaction created!');
 *   },
 * });
 * ```
 */

interface UseValidatedMutationOptions<TInput, TOutput, TError = Error> {
  schema: z.ZodSchema<TInput>;
  mutationFn: (data: TInput) => Promise<TOutput>;
  onSuccess?: (data: TOutput, variables: TInput) => void | Promise<void>;
  onError?: (error: TError, variables: unknown) => void;
  invalidateKeys?: unknown[][];
  showValidationErrors?: boolean;
}

export function useValidatedMutation<TInput, TOutput, TError = Error>({
  schema,
  mutationFn,
  onSuccess,
  onError,
  invalidateKeys = [],
  showValidationErrors = true,
}: UseValidatedMutationOptions<TInput, TOutput, TError>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rawData: unknown) => {
      // ✅ Validate data with Zod
      const validation = validateFormData(schema, rawData);

      if (!validation.success) {
        const errors = formatZodErrors(validation.errors);
        
        logger.error('Form validation failed:', {
          errors,
          data: rawData,
        });

        if (showValidationErrors) {
          errors.forEach((error) => {
            toast.error(`Erro de validação: ${error}`);
          });
        }

        // Throw validation error to stop mutation
        throw new Error(`Validação falhou: ${errors.join(', ')}`);
      }

      // ✅ Data is validated, safe to proceed
      logger.debug('Form validation passed:', validation.data);
      
      return mutationFn(validation.data);
    },

    onSuccess: async (data, variables) => {
      // Invalidate specified query keys
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key })
          )
        );
      }

      // Call custom onSuccess handler
      if (onSuccess) {
        await onSuccess(data, variables as TInput);
      }
    },

    onError: (error, variables) => {
      logger.error('Mutation failed:', error);

      if (onError) {
        onError(error as TError, variables);
      } else {
        // Default error handling
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        toast.error(`Erro: ${errorMessage}`);
      }
    },
  });
}

/**
 * ✅ Validate data synchronously without mutation
 * Useful for form-level validation before submission
 */
export function useFormValidator<T>(schema: z.ZodSchema<T>) {
  return {
    validate: (data: unknown) => validateFormData(schema, data),
    
    validateField: (field: keyof T, value: unknown) => {
      try {
        // Extract field schema if possible
        if (schema instanceof z.ZodObject) {
          const fieldSchema = schema.shape[field as string];
          if (fieldSchema) {
            fieldSchema.parse(value);
            return { success: true as const, error: null };
          }
        }
        
        // Fallback: validate entire object with only this field
        schema.parse({ [field]: value } as Partial<T>);
        return { success: true as const, error: null };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const fieldError = error.errors.find(
            (err) => err.path[0] === field
          );
          return {
            success: false as const,
            error: fieldError?.message || 'Validation error',
          };
        }
        return {
          success: false as const,
          error: 'Unknown validation error',
        };
      }
    },

    getErrors: (error: z.ZodError) => formatZodErrors(error),
  };
}

/**
 * ✅ Example usage in a component:
 * 
 * ```tsx
 * import { useValidatedMutation } from '@/lib/validatedMutation';
 * import { transactionFormSchema } from '@/lib/formValidation';
 * import { queryKeys } from '@/lib/queryClient';
 * 
 * function AddTransactionForm() {
 *   const mutation = useValidatedMutation({
 *     schema: transactionFormSchema,
 *     mutationFn: async (data) => {
 *       const { error } = await supabase
 *         .from('transactions')
 *         .insert(data);
 *       if (error) throw error;
 *       return data;
 *     },
 *     invalidateKeys: [queryKeys.transactionsBase, queryKeys.accounts],
 *     onSuccess: () => {
 *       toast.success('Transação criada!');
 *       closeModal();
 *     },
 *   });
 * 
 *   const handleSubmit = (formData: unknown) => {
 *     mutation.mutate(formData);
 *   };
 * 
 *   return (
 *     <form onSubmit={(e) => {
 *       e.preventDefault();
 *       const formData = new FormData(e.currentTarget);
 *       handleSubmit(Object.fromEntries(formData));
 *     }}>
 *       // ... form fields
 *     </form>
 *   );
 * }
 * ```
 */
