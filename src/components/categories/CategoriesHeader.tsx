import { Button } from "@/components/ui/button";
import { Plus, Upload, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Category } from "@/types";

interface CategoriesHeaderProps {
  onAddCategory: () => void;
  onImport?: () => void;
  isHeaderVersion?: boolean;
  categories?: Category[];
}

export function CategoriesHeader({
  onAddCategory,
  onImport,
  isHeaderVersion = false,
  categories = [],
}: CategoriesHeaderProps) {
  const { toast } = useToast();

  const exportToExcel = async () => {
    try {
      const { exportCategoriesToExcel } = await import('@/lib/exportUtils');
      await exportCategoriesToExcel(categories);
      
      toast({
        title: "Sucesso",
        description: `${categories.length} categoria${categories.length !== 1 ? 's' : ''} exportada${categories.length !== 1 ? 's' : ''} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar categorias",
        variant: "destructive",
      });
    }
  };

  if (!isHeaderVersion) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {onImport && (
        <Button
          onClick={onImport}
          variant="outline"
          size="sm"
          className="gap-1.5 apple-interaction h-8 text-xs"
          title="Importar"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Importar</span>
        </Button>
      )}
      <Button
        onClick={exportToExcel}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs"
        disabled={categories.length === 0}
        title="Exportar"
      >
        <FileDown className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Exportar</span>
      </Button>
      <Button
        onClick={onAddCategory}
        variant="outline"
        size="sm"
        className="gap-1.5 apple-interaction h-8 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground"
        title="Adicionar Categoria"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Adicionar</span>
      </Button>
    </div>
  );
}
