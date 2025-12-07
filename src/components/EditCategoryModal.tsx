import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Category, PREDEFINED_COLORS } from "@/types";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { EditCategoryModalProps } from "@/types/formProps";

export function EditCategoryModal({ open, onOpenChange, onEditCategory, category }: EditCategoryModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "" as Category["type"] | "",
    color: PREDEFINED_COLORS[0]
  });
  const { toast } = useToast();

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type,
        color: category.color
      });
    }
  }, [category]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!category) return;
    
    if (!formData.name.trim() || !formData.type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return;
    }

    const updates: Partial<Category> & { id: string } = { id: category.id };
    let hasChanges = false;

    if (formData.name.trim() !== category.name) {
      updates.name = formData.name.trim();
      hasChanges = true;
    }
    if (formData.type !== category.type) {
      updates.type = formData.type;
      hasChanges = true;
    }
    if (formData.color !== category.color) {
      updates.color = formData.color;
      hasChanges = true;
    }

    if (!hasChanges) {
        toast({
            title: "Aviso",
            description: "Nenhuma alteração detectada",
        });
        onOpenChange(false);
        return;
    }

    onEditCategory(updates);

    onOpenChange(false);
  };

  const handleCancel = () => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type,
        color: category.color
      });
    }
    onOpenChange(false);
  };

  const handleColorChange = (color: string) => {
    setFormData(prev => ({ ...prev, color }));
  };

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Editar Categoria</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-caption">Nome da Categoria</Label>
            <Input
              id="name"
              placeholder="Ex: Alimentação, Salário, Lazer..."
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-caption">Tipo de Categoria</Label>
            <Select value={formData.type} onValueChange={(value: Category["type"]) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ColorPicker
            value={formData.color}
            onChange={handleColorChange}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 text-body">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 text-body">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
