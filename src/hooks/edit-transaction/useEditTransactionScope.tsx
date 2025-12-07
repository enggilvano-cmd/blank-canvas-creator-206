import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { Transaction } from '@/types';

export function useEditTransactionScope(transaction: Transaction | null) {
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [pendingTransactionsCount, setPendingTransactionsCount] = useState(0);
  const [hasCompletedTransactions, setHasCompletedTransactions] = useState(false);

  const isInstallment = Boolean(transaction?.installments && transaction.installments > 1);
  // Fix: Only consider it fixed if is_fixed is explicitly true. 
  // Checking parent_transaction_id caused installment transactions (which also have parents) to be treated as fixed.
  const isFixed = Boolean(transaction?.is_fixed);

  const checkScopeRequired = async () => {
    if (!transaction) return false;

    if (isInstallment || isFixed) {
      try {
        const parentId = transaction.parent_transaction_id || transaction.id;
        const { data: childTransactions } = await supabase
          .from("transactions")
          .select("id, status, date")
          .eq("parent_transaction_id", parentId);

        // Filtrar apenas transações pendentes que são futuras ou iguais à atual
        const currentTransactionDate = new Date(transaction.date);

        const pendingCount = childTransactions?.filter(t => {
          if (t.status !== "pending") return false;
          const tDate = new Date(t.date);
          // Considera pendentes da mesma data ou futuras
          return tDate >= currentTransactionDate;
        }).length || 0;

        const hasCompleted = childTransactions?.some(t => t.status === "completed") || false;

        setPendingTransactionsCount(pendingCount);
        setHasCompletedTransactions(hasCompleted);
      } catch (error) {
        logger.error("Error fetching child transactions:", error);
        setPendingTransactionsCount(0);
        setHasCompletedTransactions(false);
      }
      
      return true;
    }
    
    return false;
  };

  return {
    scopeDialogOpen,
    setScopeDialogOpen,
    pendingTransactionsCount,
    hasCompletedTransactions,
    isInstallment,
    isFixed,
    checkScopeRequired,
  };
}
