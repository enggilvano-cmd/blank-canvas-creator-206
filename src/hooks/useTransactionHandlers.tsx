// Re-export all handlers from refactored modules
export { useTransactionMutations } from './transactions/useTransactionMutations';
export { useOfflineTransactionMutations } from './transactions/useOfflineTransactionMutations';
export { useInstallmentMutations } from './transactions/useInstallmentMutations';
export { useOfflineInstallmentMutations } from './transactions/useOfflineInstallmentMutations';
export { useTransferMutations } from './transactions/useTransferMutations';
export { useOfflineTransferMutations } from './transactions/useOfflineTransferMutations';
export { useImportMutations } from './transactions/useImportMutations';
export { useOfflineImportMutations } from './transactions/useOfflineImportMutations';
export { useCreditPaymentMutations } from './transactions/useCreditPaymentMutations';
export { useOfflineCreditPaymentMutations } from './transactions/useOfflineCreditPaymentMutations';
export { useOfflineFixedTransactionMutations } from './transactions/useOfflineFixedTransactionMutations';

// Re-export offline hooks for accounts and categories
export { useOfflineAccountMutations } from './useOfflineAccountMutations';
export { useOfflineCategoryMutations } from './useOfflineCategoryMutations';

// Wrapper hook that combines all handlers (for backward compatibility)
import { useTransactionMutations } from './transactions/useTransactionMutations';
import { useInstallmentMutations } from './transactions/useInstallmentMutations';
import { useTransferMutations } from './transactions/useTransferMutations';
import { useImportMutations } from './transactions/useImportMutations';
import { useCreditPaymentMutations } from './transactions/useCreditPaymentMutations';

export function useTransactionHandlers() {
  const transactionMutations = useTransactionMutations();
  const installmentMutations = useInstallmentMutations();
  const transferMutations = useTransferMutations();
  const importMutations = useImportMutations();
  const creditPaymentMutations = useCreditPaymentMutations();

  return {
    ...transactionMutations,
    ...installmentMutations,
    ...transferMutations,
    ...importMutations,
    ...creditPaymentMutations,
  };
}
