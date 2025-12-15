import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Category, PREDEFINED_COLORS } from "@/types";
import { ColorPicker } from "./forms/ColorPicker";
import { AddCategoryModalProps } from "@/types/formProps";

export function AddCategoryModal({ open, onOpenChange, onAddCategory }: AddCategoryModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "" as Category["type"] | "",
    color: PREDEFINED_COLORS[0]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ⚠️ CRÍTICO: Evitar submissões duplicadas ao clicar múltiplas vezes
    if (isSubmitting) {
      return;
    }
    
    setIsSubmitting(true);
    
    if (!formData.name.trim() || !formData.type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return;
    }

    try {
      onAddCategory({
        name: formData.name.trim(),
        type: formData.type,
        color: formData.color
      });

      // Reset form
      setFormData({
        name: "",
        type: "",
        color: PREDEFINED_COLORS[0]
      });
      
      onOpenChange(false);
    } finally {
      // ⚠️ CRÍTICO: Sempre resetar isSubmitting (sucesso ou erro)
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: "",
      type: "",
      color: PREDEFINED_COLORS[0]
    });
    onOpenChange(false);
  };

  const handleColorChange = (color: string) => {
    setFormData(prev => ({ ...prev, color }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Adicionar Categoria</DialogTitle>
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
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting} className="flex-1 text-body">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 text-body">
              {isSubmitting ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

