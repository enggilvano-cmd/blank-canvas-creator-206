import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash2, Search, Tag, TrendingUp, TrendingDown, ArrowUpDown, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AddCategoryModal } from "./AddCategoryModal";
import { EditCategoryModal } from "./EditCategoryModal";
import { ImportCategoriesModal } from "@/components/import/ImportCategoriesModal";
import { getUserId, withErrorHandling } from "@/lib/supabase-utils";
import type { Category } from "@/types";
import { queryKeys } from "@/lib/queryClient";
import { CategoryFilterDialog } from "@/components/categories/CategoryFilterDialog";
import { CategoryFilterChips } from "@/components/categories/CategoryFilterChips";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useOfflineCategoryMutations } from "@/hooks/useTransactionHandlers";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDebounce } from "@/hooks/useDebounce";
import { useQueryInvalidation } from "@/hooks/useQueryInvalidation";
interface CategoriesPageProps {
  importModalOpen?: boolean;
  onImportModalOpenChange?: (open: boolean) => void;
  initialCategories?: Category[];
}

interface CategoriesFilters {
  searchTerm: string;
  filterType: "all" | "income" | "expense" | "both";
}

export function CategoriesPage({
  importModalOpen: externalImportModalOpen,
  onImportModalOpenChange,
  initialCategories = [],
}: CategoriesPageProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<CategoriesFilters>(
    'categories-filters',
    {
      searchTerm: "",
      filterType: "all",
    }
  );

  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;
  
  // ✅ Debounce search to optimize performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [internalImportModalOpen, setInternalImportModalOpen] = useState(false);
  const importModalOpen = externalImportModalOpen ?? internalImportModalOpen;
  const setImportModalOpen = (open: boolean) => {
    setInternalImportModalOpen(open);
    onImportModalOpenChange?.(open);
  };
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(initialCategories.length === 0);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const {
    handleAddCategory: offlineAddCategory,
    handleEditCategory: offlineEditCategory,
    handleDeleteCategory: offlineDeleteCategory,
    handleImportCategories: offlineImportCategories,
  } = useOfflineCategoryMutations();
  const { helper } = useQueryInvalidation();
  // Generate filter chips
  const filterChips = useMemo(() => {
    const chips = [];
    
    if (filterType !== "all") {
      const typeLabels = {
        income: "Receita",
        expense: "Despesa",
        both: "Ambos"
      };
      chips.push({
        id: "type",
        label: typeLabels[filterType],
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    return chips;
  }, [filterType]);

  const clearAllFilters = () => {
    setFilterType("all");
  };

  useEffect(() => {
    // Se initialCategories foram passadas, use-as diretamente
    if (initialCategories.length > 0) {
      setCategories(initialCategories);
      setLoading(false);
      return;
    }

    // Caso contrário, carregue do banco
    const loadCategories = async () => {
      const { data } = await withErrorHandling(
        async () => {
          const userId = await getUserId();
          const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (error) throw error;
          return data || [];
        },
        'Error loading categories',
        false // Don't show toast on load error
      );

      if (data) {
        setCategories(data);
      }
      setLoading(false);
    };

    loadCategories();
  }, [initialCategories]);

  const handleAddCategory = async (categoryData: Omit<Category, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!isOnline) {
      await offlineAddCategory({
        name: categoryData.name,
        type: categoryData.type,
        color: categoryData.color,
      });
      return;
    }

    const { data } = await withErrorHandling(
      async () => {
        const userId = await getUserId();
        const { data, error } = await supabase
          .from('categories')
          .insert([{
            ...categoryData,
            user_id: userId
          }])
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      'Error adding category'
    );

    if (data) {
      setCategories(prev => [...prev, data]);
      // Invalidate categories cache so other components see the new category
      await helper.invalidate(queryKeys.categories, { refetch: true });
      toast({
        title: "Categoria Adicionada",
        description: "Categoria criada com sucesso",
      });
    }
  };
  const handleEditCategory = async (updatedCategory: Partial<Category> & { id: string }) => {
    if (!isOnline) {
      await offlineEditCategory(updatedCategory.id, {
        name: updatedCategory.name,
        type: updatedCategory.type,
        color: updatedCategory.color,
      });
      setEditingCategory(null);
      return;
    }

    const { data } = await withErrorHandling(
      async () => {
        const userId = await getUserId();
        const { error } = await supabase
          .from('categories')
          .update(updatedCategory)
          .eq('id', updatedCategory.id)
          .eq('user_id', userId);

        if (error) throw error;
        return true;
      },
      'Error updating category'
    );

    if (data) {
      setCategories(prev => prev.map(cat => 
        cat.id === updatedCategory.id ? { ...cat, ...updatedCategory } : cat
      ));
      setEditingCategory(null);
      
      // Invalidate categories cache so other components see the update
      await helper.invalidate(queryKeys.categories, { refetch: true });
      
      toast({
        title: "Categoria Atualizada",
        description: "Categoria atualizada com sucesso",
      });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!isOnline) {
      await offlineDeleteCategory(categoryId);
      setCategories(prev => prev.filter(cat => cat.id !== categoryId));
      return;
    }

    const { data } = await withErrorHandling(
      async () => {
        const userId = await getUserId();
        
        // Check if category is being used in transactions
        const { data: transactions, error: transError } = await supabase
          .from('transactions')
          .select('id')
          .eq('category_id', categoryId)
          .eq('user_id', userId)
          .limit(1);
        
        if (transError) throw transError;

        if (transactions && transactions.length > 0) {
          toast({
            title: "Erro",
            description: "Não é possível excluir uma categoria que está sendo usada em transações",
            variant: "destructive"
          });
          return null;
        }

        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId)
          .eq('user_id', userId);

        if (error) throw error;
        return true;
      },
      'Error deleting category'
    );

    if (data) {
      setCategories(prev => prev.filter(cat => cat.id !== categoryId));
      
      // Invalidate categories cache so other components see the deletion
      await helper.invalidate(queryKeys.categories, { refetch: true });
      
      toast({
        title: "Categoria Excluída",
        description: "Categoria removida com sucesso",
      });
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setEditModalOpen(true);
  };

  const handleImportCategories = async (categoriesToAdd: Omit<Category, 'id'>[], categoriesToReplaceIds: string[]) => {
    if (!isOnline) {
      await offlineImportCategories(categoriesToAdd as any, categoriesToReplaceIds);
      return;
    }

    const { data } = await withErrorHandling(
      async () => {
        const userId = await getUserId();

        // Delete categories to be replaced
        if (categoriesToReplaceIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .in('id', categoriesToReplaceIds)
            .eq('user_id', userId);

          if (deleteError) throw deleteError;
        }

        // Insert new categories
        if (categoriesToAdd.length > 0) {
          const { data, error } = await supabase
            .from('categories')
            .insert(categoriesToAdd.map(cat => ({
              ...cat,
              user_id: userId
            })))
            .select();

          if (error) throw error;
          return { data, categoriesToReplaceIds };
        }

        return null;
      },
      'Error importing categories'
    );

    if (data) {
      setCategories(prev => {
        const filtered = prev.filter(cat => !data.categoriesToReplaceIds.includes(cat.id));
        return [...filtered, ...(data.data || [])];
      });

      // Invalidate categories cache so other components see the imported categories
      await helper.invalidate(queryKeys.categories, { refetch: true });

      toast({
        title: "Sucesso",
        description: `${categoriesToAdd.length} categorias importadas`,
      });
    }
  };

  const exportToExcel = async () => {
    try {
      const { exportCategoriesToExcel } = await import('@/lib/exportUtils');
      await exportCategoriesToExcel(filteredCategories);
      
      toast({
        title: "Sucesso",
        description: `${filteredCategories.length} categoria${filteredCategories.length !== 1 ? 's' : ''} exportada${filteredCategories.length !== 1 ? 's' : ''} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar categorias",
        variant: "destructive",
      });
    }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter(category => {
      // \u2705 Use debounced search for better performance
      const matchesSearch = category.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      const matchesType = filterType === "all" || category.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [categories, debouncedSearchTerm, filterType]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "income":
        return <TrendingUp className="h-4 w-4" />;
      case "expense":
        return <TrendingDown className="h-4 w-4" />;
      case "both":
        return <ArrowUpDown className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "income":
        return "Receita";
      case "expense":
        return "Despesa";
      case "both":
        return "Ambos";
    }
  };

  const getTypeVariant = (type: string) => {
    switch (type) {
      case "income":
        return "default";
      case "expense":
        return "destructive";
      case "both":
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <div className="h-24 bg-muted rounded-xl animate-pulse"></div>
          <div className="h-24 bg-muted rounded-xl animate-pulse"></div>
          <div className="h-24 bg-muted rounded-xl animate-pulse"></div>
          <div className="h-24 bg-muted rounded-xl animate-pulse"></div>
        </div>
        <div className="h-32 bg-muted rounded-xl animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Tag className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-caption font-medium">Total</p>
                <div className="balance-text">{filteredCategories.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-caption font-medium">Receitas</p>
                <div className="balance-text balance-positive">
                  {filteredCategories.filter(c => c.type === "income" || c.type === "both").length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-caption font-medium">Despesas</p>
                <div className="balance-text balance-negative">
                  {filteredCategories.filter(c => c.type === "expense" || c.type === "both").length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ArrowUpDown className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-caption font-medium">Ambos</p>
                <div className="balance-text text-primary">
                  {filteredCategories.filter(c => c.type === "both").length}
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
              <CategoryFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                activeFiltersCount={filterChips.length}
              />
              
              <CategoryFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar categorias..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-headline font-semibold mb-2">Nenhuma categoria encontrada</h3>
            <p className="text-body text-muted-foreground mb-4">
              {searchTerm || filterType !== "all" 
                ? "Nenhum resultado encontrado"
                : "Adicione sua primeira categoria para começar"
              }
            </p>
            {(!searchTerm && filterType === "all") && (
              <Button onClick={() => setAddModalOpen(true)} className="gap-2 apple-interaction">
                <Plus className="h-4 w-4" />
                Adicionar Categoria
              </Button>
            )}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <Card key={category.id} className="financial-card apple-interaction group">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  {/* Header com Ícone, Nome e Menu */}
                  <div className="flex items-center gap-3">
                    {/* Ícone da Categoria */}
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: category.color }}
                    >
                      <Tag className="h-5 w-5 text-white" />
                    </div>

                    {/* Nome e Badge */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold truncate mb-1">
                        {category.name}
                      </h3>
                      <Badge variant={getTypeVariant(category.type)} className="gap-1 text-xs h-5 px-2 inline-flex">
                        {getTypeIcon(category.type)}
                        <span>{getTypeLabel(category.type)}</span>
                      </Badge>
                    </div>

                    {/* Menu de Ações */}
                    <div className="flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(category)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCategoryToDelete(category);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modals */}
      <AddCategoryModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onAddCategory={handleAddCategory}
      />

      <EditCategoryModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onEditCategory={handleEditCategory}
        category={editingCategory}
      />

      <ImportCategoriesModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        categories={categories}
        onImportCategories={handleImportCategories}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (categoryToDelete) {
                  handleDeleteCategory(categoryToDelete.id);
                  setDeleteDialogOpen(false);
                  setCategoryToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}