import { useFixedTransactions, notifyFixedTransactionsChange } from "@/hooks/useFixedTransactions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useQueryInvalidation } from "@/hooks/useQueryInvalidation";
import { offlineQueue } from "@/lib/offlineQueue";
import { offlineDatabase } from "@/lib/offlineDatabase";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Calendar, Search, CalendarPlus, DollarSign, MoreVertical } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import { AddFixedTransactionModal } from "./AddFixedTransactionModal";
import { EditFixedTransactionModal } from "./EditFixedTransactionModal";
import { Skeleton } from "@/components/ui/skeleton";
// FixedTransactionPageActions is available but unused currently
import { ImportFixedTransactionsModal } from "./ImportFixedTransactionsModal";
import { loadXLSX } from "@/lib/lazyImports";
import { formatBRNumber } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { FixedTransactionFilterDialog } from "@/components/fixedtransactions/FixedTransactionFilterDialog";
import { FixedTransactionFilterChips } from "@/components/fixedtransactions/FixedTransactionFilterChips";
import { FixedTransactionList } from "./fixedtransactions/FixedTransactionList";
import type { Category, Account, Transaction } from "@/types";

interface FixedTransactionsFilters {
  searchTerm: string;
  filterType: "all" | "income" | "expense";
  categoryId: string;
  accountId: string;
  isProvision: string;
  sortBy: "data" | "valor";
}

export function FixedTransactionsPage({
  importModalOpen: externalImportModalOpen,
  onImportModalOpenChange,
  addModalOpen: externalAddModalOpen,
  onAddModalOpenChange,
}: {
  importModalOpen?: boolean;
  onImportModalOpenChange?: (open: boolean) => void;
  addModalOpen?: boolean;
  onAddModalOpenChange?: (open: boolean) => void;
} = {}) {
  const { invalidateTransactions } = useQueryInvalidation();
  useAuth(); // Keep for auth context
  
  // State for sort direction
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<FixedTransactionsFilters>(
    'fixed-transactions-filters',
    {
      searchTerm: "",
      filterType: "all",
      categoryId: "all",
      accountId: "all",
      isProvision: "all",
      sortBy: "data",
    }
  );

  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;
  const categoryId = filters.categoryId || "all";
  const accountId = filters.accountId || "all";
  const isProvision = filters.isProvision || "all";
  const sortBy = filters.sortBy || "data";

  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));
  const setCategoryId = (value: string) => setFilters((prev) => ({ ...prev, categoryId: value }));
  const setAccountId = (value: string) => setFilters((prev) => ({ ...prev, accountId: value }));
  const setIsProvision = (value: string) => setFilters((prev) => ({ ...prev, isProvision: value }));
  const setSortBy = (value: "data" | "valor") => setFilters((prev) => ({ ...prev, sortBy: value }));
  const toggleSortOrder = () => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  
  const isOnline = useOnlineStatus();

  // ✅ P0-7 FIX: Usar hook híbrido offline/online para transações fixas
  const { 
    data, 
    isLoading: loading, 
    refetch: loadFixedTransactions 
  } = useFixedTransactions();

  const transactions = data || [];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [internalAddModalOpen, setInternalAddModalOpen] = useState(false);
  const addModalOpen = externalAddModalOpen ?? internalAddModalOpen;
  const setAddModalOpen = (open: boolean) => {
    setInternalAddModalOpen(open);
    onAddModalOpenChange?.(open);
  };
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [internalImportModalOpen, setInternalImportModalOpen] = useState(false);
  const importModalOpen = externalImportModalOpen ?? internalImportModalOpen;
  const setImportModalOpen = (open: boolean) => {
    setInternalImportModalOpen(open);
    onImportModalOpenChange?.(open);
  };
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const { toast } = useToast();

  // Generate filter chips
  const filterChips = useMemo(() => {
    const chips = [];
    
    if (filterType !== "all") {
      const typeLabels = {
        income: "Receita",
        expense: "Despesa"
      };
      chips.push({
        id: "type",
        label: typeLabels[filterType],
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    if (categoryId !== "all") {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        chips.push({
          id: "category",
          label: category.name,
          value: categoryId,
          onRemove: () => setCategoryId("all"),
        });
      }
    }

    if (accountId !== "all") {
      const account = accounts.find((a) => a.id === accountId);
      if (account) {
        chips.push({
          id: "account",
          label: account.name,
          value: accountId,
          onRemove: () => setAccountId("all"),
        });
      }
    }

    if (isProvision !== "all") {
      chips.push({
        id: "provision",
        label: isProvision === "true" ? "Apenas Provisões" : "Sem Provisões",
        value: isProvision,
        onRemove: () => setIsProvision("all"),
      });
    }

    return chips;
  }, [filterType, categoryId, accountId, isProvision, categories, accounts]);

  const clearAllFilters = () => {
    setFilterType("all");
    setCategoryId("all");
    setAccountId("all");
    setIsProvision("all");
  };

  useEffect(() => {
    loadAccounts();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      logger.error("Error loading categories:", error);
    }
  };

  const loadAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type, balance, color, limit_amount, due_date, closing_date")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      logger.error("Error loading accounts:", error);
    }
  };

  const handleAdd = async (transaction: { description: string; amount: number; type: 'income' | 'expense'; category_id: string | null; account_id: string; date: string; is_fixed: boolean; status?: 'pending' | 'completed'; is_provision?: boolean }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const saveOffline = async () => {
      const tempId = `temp-${Date.now()}`;
      const newTransaction = {
        ...transaction,
        id: tempId,
        user_id: user.id,
        is_fixed: true,
        status: transaction.status || "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parent_transaction_id: null,
      };

      // Enriquecer com dados de categoria/conta para UI
      let categoryData = null;
      if (transaction.category_id) {
          const cats = await offlineDatabase.getCategories(user.id);
          const cat = cats.find(c => c.id === transaction.category_id);
          if (cat) categoryData = { name: cat.name, color: cat.color };
      }
      
      let accountData = null;
      if (transaction.account_id) {
          const accs = await offlineDatabase.getAccounts(user.id);
          const acc = accs.find(a => a.id === transaction.account_id);
          if (acc) accountData = { name: acc.name };
      }

      // ✅ Type-safe: Criar transação com relações
      const transactionWithRelations = {
        ...newTransaction,
        category: categoryData,
        account: accountData,
      };

      await offlineDatabase.saveTransactions([transactionWithRelations as Transaction]);
      
      await offlineQueue.enqueue({
        type: 'add_fixed_transaction',
        data: {
          description: newTransaction.description,
          amount: newTransaction.amount,
          start_date: transaction.date,
          recurrence: 'monthly',
          type: newTransaction.type as 'income' | 'expense',
          category_id: newTransaction.category_id || '',
          account_id: newTransaction.account_id,
          status: newTransaction.status,
          is_provision: transaction.is_provision || false,
        },
      });

      toast({
        title: "Transação salva offline",
        description: "Será sincronizada quando houver conexão.",
      });

      loadFixedTransactions();
      notifyFixedTransactionsChange();
      setAddModalOpen(false);
    };

    if (!isOnline) {
      await saveOffline();
      return;
    }

    try {
      // Chamada direta via RPC para evitar problemas de deploy da Edge Function
      const { data, error } = await supabase.rpc('atomic_create_fixed_transaction', {
        p_user_id: user.id,
        p_description: transaction.description,
        p_amount: transaction.amount,
        p_date: transaction.date,
        p_type: transaction.type,
        p_category_id: transaction.category_id || '',
        p_account_id: transaction.account_id,
        p_status: transaction.status || "pending",
        p_is_provision: transaction.is_provision || false,
      });

      if (error) {
        const errorMessage = error.message || JSON.stringify(error);
        console.error('❌ RPC Error:', { error, message: errorMessage });
        
        // Detectar erros de rede e fazer fallback
        if (errorMessage.includes("Failed to send a request") || 
            errorMessage.includes("NetworkError") || 
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("Load failed")) {
          logger.warn("Network error detected during RPC call, falling back to offline mode.");
          await saveOffline();
          return;
        }
        throw error;
      }

      // RPC retorna array de objetos ou objeto direto dependendo da definição RETURNS TABLE
      const result = Array.isArray(data) ? data[0] : data;
      
      if (!result?.success) {
        throw new Error(result?.error_message || 'Erro ao criar transação fixa');
      }

      toast({
        title: "Transação fixa adicionada",
        description: `${result.created_count || 1} transações foram geradas com sucesso`,
      });

      // 🔄 Buscar dados atualizados do servidor para cache offline
      const { data: allFixedTransactions } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_fixed", true);

      if (allFixedTransactions && allFixedTransactions.length > 0) {
        await offlineDatabase.saveTransactions(allFixedTransactions as any);
      }

      // 🔄 Sincronizar listas e dashboard imediatamente
      await invalidateTransactions();

      loadFixedTransactions(); // Refetch fixed transactions
      notifyFixedTransactionsChange();
      setAddModalOpen(false);
    } catch (error) {
      // Catch também para exceções de rede lançadas pelo invoke
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error adding fixed transaction:', { error, errorMessage });
      
      if (errorMessage.includes("Failed to send a request") || 
          errorMessage.includes("NetworkError") || 
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("Load failed")) {
        logger.warn("Network error exception detected, falling back to offline mode.");
        await saveOffline();
        return;
      }

      logger.error("Error adding fixed transaction:", error);
      
      // Mensagens de erro mais específicas
      let displayMessage = "Não foi possível adicionar a transação fixa.";
      if (errorMessage.includes("Account not found")) {
        displayMessage = "A conta selecionada não existe ou não pertence a você.";
      } else if (errorMessage.includes("Category not found")) {
        displayMessage = "A categoria selecionada não existe ou não pertence a você.";
      } else if (error instanceof Error) {
        displayMessage = error.message;
      }
      
      toast({
        title: "Erro ao adicionar transação",
        description: displayMessage,
        variant: "destructive",
      });
    }
  };

  const handleEditClick = async (transaction: Transaction) => {
    setTransactionToEdit(transaction);
    setEditModalOpen(true);
  };

  const handleEdit = async (transaction: Transaction) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!transactionToEdit) return;

    // Comparar valores originais com editados e enviar apenas os campos alterados
    const updates: Record<string, unknown> = {};

    if (transaction.description !== transactionToEdit.description) {
      updates.description = transaction.description;
    }
    if (transaction.amount !== transactionToEdit.amount) {
      updates.amount = transaction.amount;
    }
    if (transaction.type !== transactionToEdit.type) {
      updates.type = transaction.type;
    }
    if (transaction.category_id !== transactionToEdit.category_id && transaction.category_id) {
      // Só envia category_id se houver um valor válido (string)
      updates.category_id = transaction.category_id;
    }
    if (transaction.account_id !== transactionToEdit.account_id) {
      updates.account_id = transaction.account_id;
    }
    if (transaction.date !== transactionToEdit.date) {
      updates.date = transaction.date;
    }
    if (transaction.invoice_month !== transactionToEdit.invoice_month) {
      updates.invoice_month = transaction.invoice_month || undefined;
      updates.invoice_month_overridden = Boolean(transaction.invoice_month);
    }

    // Se nenhum campo foi alterado, não fazer nada
    if (Object.keys(updates).length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: "Nenhum campo foi modificado.",
      });
      setEditModalOpen(false);
      return;
    }

    // --- OPTIMISTIC UPDATE START ---
    // 1. Close modal immediately
    setEditModalOpen(false);
    const currentTransactionToEdit = transactionToEdit; // Capture for closure
    setTransactionToEdit(null);

    // 2. Update local DB immediately
    const updatedTransaction = { ...currentTransactionToEdit, ...updates };
    await offlineDatabase.saveTransactions([updatedTransaction as any]);
    
    // 3. Refresh UI immediately
    loadFixedTransactions();
    notifyFixedTransactionsChange();
    
    toast({
        title: "Salvando...",
        description: "Atualizando transação em segundo plano.",
    });
    // --- OPTIMISTIC UPDATE END ---

    const isTempId = transaction.id.startsWith('temp-');

    const saveOffline = async () => {
      // We already saved to offlineDatabase above!
      // Just enqueue the sync job.
      
      await offlineQueue.enqueue({
        type: 'edit',
        data: {
          id: transaction.id,
          updates,
          scope: 'current' as const,
        },
      });
    };

    if (!isOnline || isTempId) {
      await saveOffline();
      return;
    }

    try {
      // 1) Buscar status da transação principal
      const { data: mainTransaction, error: statusError } = await supabase
        .from("transactions")
        .select("status")
        .eq("id", transaction.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (statusError) throw statusError;

      // Editar a transação principal SOMENTE se estiver PENDENTE
      if (mainTransaction?.status === "pending") {
        // Preparar updates para o backend (valor já está em centavos)
        const backendUpdates = { ...updates };

        const { data, error: mainError } = await supabase.functions.invoke('atomic-edit-transaction', {
          body: {
            transaction_id: transaction.id,
            updates: backendUpdates,
            scope: 'current',
          },
        });

        if (mainError) throw mainError;

        const result = Array.isArray(data) ? data[0] : data;
        if (result && !result.success) {
             throw new Error(result.error || 'Erro ao editar transação');
        }
      }

      // 2) Buscar e editar todas as filhas PENDENTES dessa fixa
      const { data: childTransactions, error: childError } = await supabase
        .from("transactions")
        .select("id, status, date")
        .eq("parent_transaction_id", transaction.id)
        .eq("user_id", user.id)
        .eq("status", "pending"); // Buscar APENAS pendentes

      if (childError) throw childError;

      // Editar apenas as filhas pendentes com os mesmos campos alterados
      if (childTransactions && childTransactions.length > 0) {
        for (const child of childTransactions) {
          const childUpdates = { ...updates };

          // Se houver atualização de data, calcular a nova data para a filha
          // mantendo o mês e ano originais da filha, alterando apenas o dia
          if (updates.date) {
            const newDay = new Date(updates.date as string).getUTCDate();
            const childDate = new Date(child.date);
            
            // Criar nova data mantendo ano e mês da filha, mas com o novo dia
            // Usando UTC para evitar problemas de fuso horário
            const newChildDate = new Date(Date.UTC(
              childDate.getUTCFullYear(),
              childDate.getUTCMonth(),
              newDay
            ));

            // Ajustar se o mês mudou (ex: dia 31 em fevereiro)
            if (newChildDate.getUTCMonth() !== childDate.getUTCMonth()) {
              newChildDate.setUTCDate(0); // Define para o último dia do mês anterior (o mês correto)
            }

            childUpdates.date = newChildDate.toISOString().split('T')[0];
          }

          const { data, error } = await supabase.functions.invoke('atomic-edit-transaction', {
            body: {
              transaction_id: child.id,
              updates: childUpdates,
              scope: 'current',
            },
          });

          if (error) throw error;

          const result = Array.isArray(data) ? data[0] : data;
          if (result && !result.success) {
               throw new Error(result.error || 'Erro ao editar transação filha');
          }
        }
      }

      // 🔄 Buscar dados atualizados do servidor para cache offline
      const { data: updatedMainTx } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transaction.id)
        .eq("user_id", user.id)
        .maybeSingle();

      // Atualizar também as transações filhas que foram editadas
      let updatedChildren: Transaction[] = [];
      if (childTransactions && childTransactions.length > 0) {
        const { data: freshChildren } = await supabase
          .from("transactions")
          .select("*")
          .in("id", childTransactions.map(c => c.id));
        updatedChildren = freshChildren || [];
      }

      // Salvar tudo no cache offline
      const allUpdated = [];
      if (updatedMainTx) allUpdated.push(updatedMainTx);
      allUpdated.push(...updatedChildren);
      if (allUpdated.length > 0) {
        await offlineDatabase.saveTransactions(allUpdated as any);
      }

      toast({
        title: "Transações atualizadas",
        description: "A transação fixa e todas as ocorrências pendentes foram atualizadas. As concluídas foram preservadas.",
      });

      // 🔄 Sincronizar listas e dashboard imediatamente
      await invalidateTransactions();

      loadFixedTransactions();
      notifyFixedTransactionsChange();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Failed to send a request") || 
          errorMessage.includes("NetworkError") || 
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("Load failed")) {
        logger.warn("Network error exception detected during edit, falling back to offline mode.");
        await saveOffline();
        return;
      }

      logger.error("Error updating transaction:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a transação.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = async (transaction: Transaction) => {
    setTransactionToDelete(transaction);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!transactionToDelete) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const isTempId = transactionToDelete.id.startsWith('temp-');

    const deleteOffline = async () => {
      await offlineDatabase.deleteTransaction(transactionToDelete.id);
      
      // Se for temp, não precisamos mandar delete pro servidor se a criação ainda não foi processada.
      // Mas como não temos controle fino da fila, mandamos o delete e o sync que se vire (ou ignoramos se for temp).
      // Se for temp, o sync de 'delete' já ignora. Então é seguro enfileirar.
      await offlineQueue.enqueue({
        type: 'delete',
        data: { id: transactionToDelete.id, scope: 'all' as const },
      });

      toast({ title: "Removido offline", description: "Sincronizará quando online." });
      loadFixedTransactions();
      notifyFixedTransactionsChange();
      setTransactionToDelete(null);
      setDeleteDialogOpen(false);
    };

    if (!isOnline || isTempId) {
      await deleteOffline();
      return;
    }

    try {
      // 1) Buscar transação principal (fixa) com status
      const { data: mainTransaction, error: mainError } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("id", transactionToDelete.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (mainError) throw mainError;

      // 2) Tentar remover filhas PENDENTES
      const { error: deleteChildrenError } = await supabase
        .from("transactions")
        .delete()
        .eq("parent_transaction_id", transactionToDelete.id)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (deleteChildrenError) {
        logger.warn("Erro ao excluir filhas pendentes:", deleteChildrenError);
        // Não lançamos erro aqui para tentar pelo menos remover a principal da lista (soft delete)
      }

      // Verificar se restaram filhos (completados ou os que não conseguimos deletar)
      const { count: remainingChildrenCount, error: countError } = await supabase
        .from("transactions")
        .select("*", { count: 'exact', head: true })
        .eq("parent_transaction_id", transactionToDelete.id);
      
      if (countError) throw countError;

      const hasChildren = remainingChildrenCount !== null && remainingChildrenCount > 0;
      const isCompleted = mainTransaction?.status === "completed";
      const childrenDeletionFailed = !!deleteChildrenError;

      // 3) Decidir se fazemos Soft Delete ou Hard Delete
      // Soft Delete (apenas desmarcar is_fixed) se:
      // - Principal está concluída
      // - Tem filhos restantes
      // - Falhou ao deletar filhos (para segurança)
      if (isCompleted || hasChildren || childrenDeletionFailed) {
        const { error: updateMainError } = await supabase
          .from("transactions")
          .update({ is_fixed: false })
          .eq("id", transactionToDelete.id)
          .eq("user_id", user.id);

        if (updateMainError) throw updateMainError;

        if (childrenDeletionFailed) {
           toast({
             title: "Transação atualizada",
             description: "A transação foi removida da lista de fixas, mas algumas ocorrências pendentes podem não ter sido excluídas devido a um erro.",
           });
        } else {
           toast({
             title: "Transação removida",
             description: "A transação foi removida da lista de fixas.",
           });
        }
        
        // Atualizar banco local imediatamente para refletir a remoção na UI
        await offlineDatabase.deleteTransaction(transactionToDelete.id);
      } else {
        // 4) Hard Delete da principal (se estiver pendente e sem filhos)
        const { error: deleteMainError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", transactionToDelete.id)
          .eq("user_id", user.id)
          .eq("status", "pending");

        if (deleteMainError) {
          // Se falhar ao deletar (ex: restrição de chave estrangeira não detectada),
          // fazemos um "soft delete" desmarcando como fixa.
          logger.warn("Erro ao excluir transação fixa (hard delete), tentando soft delete:", deleteMainError);
          
          const { error: updateMainError } = await supabase
            .from("transactions")
            .update({ is_fixed: false })
            .eq("id", transactionToDelete.id)
            .eq("user_id", user.id);

          if (updateMainError) throw updateMainError;
          
          toast({
            title: "Transação removida",
            description: "A transação foi removida da lista de fixas (soft delete).",
          });
        } else {
          toast({
            title: "Transação removida",
            description: "A transação e suas ocorrências pendentes foram removidas.",
          });
        }
        
        // Atualizar banco local imediatamente para refletir a remoção na UI
        await offlineDatabase.deleteTransaction(transactionToDelete.id);
      }

      // 🔄 Sincronizar listas e dashboard imediatamente
      await invalidateTransactions();

      loadFixedTransactions();
      notifyFixedTransactionsChange();
      setTransactionToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Failed to send a request") || 
          errorMessage.includes("NetworkError") || 
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("Load failed")) {
        logger.warn("Network error exception detected during delete, falling back to offline mode.");
        await deleteOffline();
        return;
      }

      logger.error("Error deleting transaction:", error);
      toast({
        title: "Erro ao remover",
        description: `Não foi possível remover a transação: ${errorMessage}`,
        variant: "destructive",
      });
      setTransactionToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleGenerateNext12Months = async (transactionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isTempId = transactionId.startsWith('temp-');
      if (isTempId) {
        toast({
          title: "Aguarde a sincronização",
          description: "Esta transação ainda não foi sincronizada com o servidor. Tente novamente em instantes.",
          variant: "destructive",
        });
        return;
      }

      // Buscar a transação fixa principal
      const { data: mainTransaction, error: fetchError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (fetchError || !mainTransaction) {
        throw new Error("Transação não encontrada");
      }

      // Buscar a última transação gerada (maior data)
      const { data: childTransactions, error: childError } = await supabase
        .from("transactions")
        .select("date")
        .eq("parent_transaction_id", transactionId)
        .order("date", { ascending: false })
        .limit(1);

      if (childError) throw childError;

      // Determinar a data inicial para os próximos 12 meses
      let startDate: Date;
      if (childTransactions && childTransactions.length > 0) {
        // Se existem transações filhas, começar do mês seguinte à última
        const lastDate = new Date(childTransactions[0].date);
        startDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, lastDate.getDate());
      } else {
        // Se não existem transações filhas, começar do mês seguinte à principal
        const mainDate = new Date(mainTransaction.date);
        startDate = new Date(mainDate.getFullYear(), mainDate.getMonth() + 1, mainDate.getDate());
      }

      const dayOfMonth = new Date(mainTransaction.date).getDate();
      const transactionsToGenerate = [];

      // Gerar 12 meses subsequentes
      for (let i = 0; i < 12; i++) {
        const nextDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + i,
          dayOfMonth
        );

        // Ajustar para o dia correto do mês
        const targetMonth = nextDate.getMonth();
        nextDate.setDate(dayOfMonth);

        // Se o mês mudou, ajustar para o último dia do mês anterior
        if (nextDate.getMonth() !== targetMonth) {
          nextDate.setDate(0);
        }

        transactionsToGenerate.push({
          description: mainTransaction.description,
          amount: mainTransaction.amount,
          date: nextDate.toISOString().split("T")[0],
          type: mainTransaction.type,
          category_id: mainTransaction.category_id,
          account_id: mainTransaction.account_id,
          status: "pending" as const,
          user_id: user.id,
          is_fixed: false,
          // is_provision removed - column doesn't exist in DB
          parent_transaction_id: transactionId,
        });
      }

      // Inserir as novas transações
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(transactionsToGenerate);

      if (insertError) throw insertError;

      toast({
        title: "Transações geradas",
        description: `12 novos meses foram gerados com sucesso.`,
      });

      // 🔄 Buscar dados atualizados (inclusão dos 12 novos meses)
      const { data: updatedFixedTx } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (updatedFixedTx) {
        await offlineDatabase.saveTransactions([updatedFixedTx as any]);
      }

      // 🔄 Sincronizar listas e dashboard
      await invalidateTransactions();

      loadFixedTransactions();
      notifyFixedTransactionsChange();
    } catch (error) {
      logger.error("Error generating next 12 months:", error);
      toast({
        title: "Erro ao gerar transações",
        description: "Não foi possível gerar os próximos 12 meses.",
        variant: "destructive",
      });
    }
  };

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((transaction) => {
      const matchesSearch = transaction.description
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType =
        filterType === "all" || transaction.type === filterType;
      const matchesCategory =
        categoryId === "all" || transaction.category_id === categoryId;
      const matchesAccount =
        accountId === "all" || transaction.account_id === accountId;
      const matchesProvision =
        isProvision === "all" ||
        (isProvision === "true" ? transaction.is_provision : !transaction.is_provision);

      return matchesSearch && matchesType && matchesCategory && matchesAccount && matchesProvision;
    });

    // Apply sorting
    if (sortBy === "valor") {
      result = result.sort((a, b) => {
        const diff = b.amount - a.amount;
        return sortOrder === 'asc' ? -diff : diff;
      });
    } else {
      // Sort by day only (ignoring month and year)
      result = result.sort((a, b) => {
        const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
        
        const dayA = dateA.getDate();
        const dayB = dateB.getDate();
        
        const diff = dayB - dayA;
        return sortOrder === 'asc' ? -diff : diff;
      });
    }

    return result;
  }, [transactions, searchTerm, filterType, categoryId, accountId, isProvision, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const totalFixed = filteredTransactions.length;
    const monthlyIncome = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const monthlyExpenses = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const monthlyBalance = monthlyIncome - monthlyExpenses;

    return { totalFixed, monthlyIncome, monthlyExpenses, monthlyBalance };
  }, [filteredTransactions]);

  const handleExportToExcel = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Para cada parent, contar quantas children pending existem
      const exportDataPromises = filteredTransactions.map(async (transaction) => {
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: 'exact', head: true })
          .eq("parent_transaction_id", transaction.id)
          .eq("status", "pending");

        const account = transaction.account || accounts.find(a => a.id === transaction.account_id);
        const dateStr = typeof transaction.date === 'string' ? transaction.date : transaction.date.toISOString().split('T')[0];

        return {
          Descrição: transaction.description,
          Valor: formatBRNumber(Math.abs(transaction.amount)),
          Tipo: transaction.type === "income" ? "Receita" : "Despesa",
          Conta: account?.name || "",
          Categoria: transaction.category?.name || "",
          "Dia do Mês": parseInt(dateStr.split('-')[2], 10),
          "Meses Gerados": count || 0,
          "Provisão": transaction.is_provision ? "Sim" : "Não",
        };
      });

      const exportData = await Promise.all(exportDataPromises);

      const XLSX = await loadXLSX();
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planejamento");
      
      const fileName = `transacoes_fixas_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportação concluída",
        description: `${exportData.length} transação(ões) fixa(s) exportada(s) com sucesso.`,
      });
    } catch (error) {
      logger.error("Error exporting fixed transactions:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar as transações fixas.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Total de Fixas
                </p>
                <div className="balance-text">{stats.totalFixed}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Receitas Mensais
                </p>
                <div className="balance-text balance-positive">
                  {formatCurrency(stats.monthlyIncome)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Despesas Mensais
                </p>
                <div className="balance-text balance-negative">
                  {formatCurrency(stats.monthlyExpenses)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Saldo Mensal
                </p>
                <div
                  className={`balance-text ${
                    stats.monthlyBalance >= 0
                      ? "balance-positive"
                      : "balance-negative"
                  }`}
                >
                  {formatCurrency(stats.monthlyBalance)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4">
            {/* Filter button and active chips */}
            <div className="flex flex-wrap items-center gap-3">
              <FixedTransactionFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                categoryId={categoryId}
                onCategoryIdChange={setCategoryId}
                accountId={accountId}
                onAccountIdChange={setAccountId}
                isProvision={isProvision}
                onIsProvisionChange={setIsProvision}
                activeFiltersCount={filterChips.length}
                accounts={accounts}
                categories={categories}
              />
              
              <FixedTransactionFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search with Sort Dropdown */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar planejamento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Sort Dropdown and Order Button */}
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as "data" | "valor")}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="data">Data</SelectItem>
                    <SelectItem value="valor">Valor</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleSortOrder}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa sobre o botão de renovação */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <CalendarPlus className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-body text-muted-foreground">
              <strong>Dica:</strong> Use o botão <MoreVertical className="h-4 w-4 inline mx-1" /> ao lado de cada transação 
              para adicionar automaticamente mais 12 transações no ano subsequente às já lançadas.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <FixedTransactionList
          transactions={filteredTransactions}
          accounts={accounts}
          categories={categories}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
          onGenerateNext12Months={handleGenerateNext12Months}
        />
      </div>

      {/* AlertDialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Transação Fixa?</AlertDialogTitle>
            <AlertDialogDescription>
              {transactionToDelete && (
                <>
                  Você está prestes a excluir a transação fixa &quot;{transactionToDelete.description}&quot;.
                  <br /><br />
                  <strong>Atenção:</strong> Esta ação removerá a transação principal e todas as transações 
                  <strong> pendentes</strong> associadas. As transações já concluídas não serão afetadas. 
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddFixedTransactionModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onAddTransaction={handleAdd}
        accounts={accounts as any}
      />

      {transactionToEdit && (
        <EditFixedTransactionModal
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) setTransactionToEdit(null);
          }}
          onEditTransaction={handleEdit}
          transaction={transactionToEdit}
          accounts={accounts as any}
          hideStatusAndInvoice={true}
        />
      )}

      <ImportFixedTransactionsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportComplete={loadFixedTransactions}
        accounts={accounts as any}
        categories={categories}
      />
    </div>
  );
}
