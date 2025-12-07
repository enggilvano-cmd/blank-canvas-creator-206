import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, AlertCircle, MoreVertical, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { loadXLSX } from "@/lib/lazyImports";
import type { ImportCategoryData } from '@/types';
import { ImportSummaryCards } from "@/components/import/ImportSummaryCards";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  color: string;
}

interface ImportCategoriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onImportCategories: (categories: ImportCategoryData[], categoriesToReplace: string[]) => void;
}

interface ImportedCategory {
  nome: string;
  tipo: string;
  cor: string;
  isValid: boolean;
  errors: string[];
  parsedType?: 'income' | 'expense' | 'both';
  isDuplicate: boolean;
  existingCategoryId?: string;
  resolution: 'skip' | 'add' | 'replace';
}

export function ImportCategoriesModal({ 
  open, 
  onOpenChange, 
  categories,
  onImportCategories 
}: ImportCategoriesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importedData, setImportedData] = useState<ImportedCategory[]>([]);
  const [excludedIndexes, setExcludedIndexes] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const previewSectionRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para preview após processar
  useEffect(() => {
    if (importedData.length > 0 && previewSectionRef.current) {
      setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [importedData.length]);

  // Suporte a cabeçalhos exportados em diferentes idiomas e por páginas do app
  const HEADERS = {
    name: ['Nome', 'Name', 'Nombre', 'Nome da Categoria', 'Category Name', 'Nombre de la Categoría'],
    type: ['Tipo', 'Type', 'Tipo', 'Tipo da Categoria', 'Category Type', 'Tipo de la Categoría'],
    color: ['Cor', 'Color', 'Color', 'Cor da Categoria', 'Category Color', 'Color de la Categoría']
  } as const;

  // Normalizadores (definidos antes de usar)
  const normalizeString = (str: string): string => {
    return (str ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  };
  const normalizeKey = (str: string): string => normalizeString(str).replace(/[^a-z0-9]/g, '');

  const pick = (row: Record<string, unknown>, keys: readonly string[]) => {
    // Mapa normalizado de chaves do Excel -> valor
    const keyMap = new Map<string, unknown>();
    for (const k of Object.keys(row)) {
      keyMap.set(normalizeKey(k), row[k]);
    }
    for (const key of keys) {
      const candidates = [key, key.toLowerCase()];
      for (const c of candidates) {
        const nk = normalizeKey(c);
        if (keyMap.has(nk)) {
          return keyMap.get(nk);
        }
      }
    }
    return '';
  };
  const validateCategoryType = (tipo: string): 'income' | 'expense' | 'both' | null => {
    const normalizedType = normalizeString(tipo);
    // Suporte para PT-BR, EN-US, ES-ES (singular e plural)
    if (['receita', 'receitas', 'income', 'entrada', 'entradas', 'ingreso', 'ingresos'].includes(normalizedType)) return 'income';
    if (['despesa', 'despesas', 'expense', 'expenses', 'saida', 'saidas', 'gasto', 'gastos'].includes(normalizedType)) return 'expense';
    if (['ambos', 'both', 'misto', 'mista'].includes(normalizedType)) return 'both';
    return null;
  };

  const isValidColor = (color: string): boolean => {
    // Valida cor em formato hexadecimal (#RRGGBB ou #RGB)
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
  };

  const validateAndCheckDuplicate = (row: Record<string, unknown>): ImportedCategory => {
    const errors: string[] = [];
    let isValid = true;

    // Usar o mapeador de cabeçalhos para suportar diferentes idiomas
    const nome = String(pick(row, HEADERS.name) || '').trim();
    const tipo = String(pick(row, HEADERS.type) || '').trim();
    const cor = String(pick(row, HEADERS.color) || '').trim();

    if (!nome) {
      errors.push('Nome é obrigatório');
      isValid = false;
    }

    if (!tipo) {
      errors.push('Tipo é obrigatório');
      isValid = false;
    }

    if (!cor) {
      errors.push('Cor é obrigatória');
      isValid = false;
    }

    const parsedType = validateCategoryType(tipo);
    if (!parsedType) {
      errors.push('Tipo inválido. Use: Receita, Despesa ou Ambos');
      isValid = false;
    }

    if (cor && !isValidColor(cor)) {
      errors.push('Cor inválida. Use formato hexadecimal (ex: #FF0000)');
      isValid = false;
    }

    // Verificação de duplicata (por nome normalizado)
    let isDuplicate = false;
    let existingCategoryId: string | undefined;
    
    if (isValid && nome) {
      const normalizedNome = normalizeString(nome);
      const existingCategory = categories.find(cat => 
        normalizeString(cat.name) === normalizedNome
      );

      if (!existingCategory) {
        // Logs de diagnóstico para entender por que não casou
        const candidatos = categories
          .filter(cat => normalizeString(cat.name).includes(normalizedNome.substring(0, Math.min(5, normalizedNome.length))))
          .map(cat => ({ id: cat.id, name: cat.name, normalized: normalizeString(cat.name), type: cat.type, color: cat.color }));
        logger.debug('[ImportCat] Sem duplicata. Contexto:', {
          nome,
          normalizedNome,
          tipo: parsedType,
          cor,
          candidatos
        });
      }

      if (existingCategory) {
        isDuplicate = true;
        existingCategoryId = existingCategory.id;
        logger.debug('[ImportCat] Duplicata encontrada:', { nome, existingCategory });
      }
    }

    return {
      nome,
      tipo,
      cor,
      isValid,
      errors,
      parsedType: parsedType || undefined,
      isDuplicate,
      existingCategoryId,
      resolution: isDuplicate ? 'skip' : 'add',
    };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: 'Erro',
        description: 'Arquivo inválido. Selecione um arquivo Excel (.xlsx ou .xls)',
        variant: "destructive"
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const XLSX = await loadXLSX();
      
      const fileBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet);

      if (rawData.length === 0) {
        toast({
          title: 'Erro',
          description: 'O arquivo está vazio. Adicione dados antes de importar',
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      const validatedData = (rawData as Record<string, unknown>[]).map((row) => validateAndCheckDuplicate(row));
      setImportedData(validatedData);

      const summary = validatedData.reduce((acc, t) => {
        if (!t.isValid) acc.invalid++;
        else if (t.isDuplicate) acc.duplicates++;
        else acc.new++;
        return acc;
      }, { new: 0, duplicates: 0, invalid: 0 });

      toast({
        title: 'Arquivo processado',
        description: `Encontradas: ${summary.new} novas, ${summary.duplicates} duplicadas, ${summary.invalid} com erros`,
      });

    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao ler o arquivo. Verifique o formato e tente novamente',
        variant: "destructive"
      });
    }

    setIsProcessing(false);
  };

  const handleImport = () => {
    logger.debug('[ImportCategories] handleImport chamado. Estado inicial:', {
      totalImportData: importedData.length,
      excludedCount: excludedIndexes.size,
      importDataSample: importedData.slice(0, 3).map(c => ({
        nome: c.nome,
        isValid: c.isValid,
        isDuplicate: c.isDuplicate,
        resolution: c.resolution
      }))
    });

    // Itens para adicionar incluem:
    // - Itens novos (não duplicatas) com resolution='add' 
    // - Itens duplicados com resolution='add' (adicionar como nova categoria)
    // - Itens duplicados com resolution='replace' (substituir a existente)
    const categoriesToAdd = importedData
      .filter((c, index) => 
        !excludedIndexes.has(index) && 
        c.isValid && 
        (c.resolution === 'add' || c.resolution === 'replace')
      )
      .map(c => ({
        name: c.nome.trim(),
        type: c.parsedType as 'income' | 'expense' | 'both',
        color: c.cor.trim().toUpperCase(),
      }));

    const categoriesToReplaceIds = importedData
      .filter((c, index) => {
        const shouldInclude = !excludedIndexes.has(index) && 
          c.isValid && 
          c.isDuplicate && 
          c.resolution === 'replace' && 
          c.existingCategoryId;
        
        if (shouldInclude) {
          logger.debug('[ImportCategories] Item marcado para substituição:', {
            index,
            nome: c.nome,
            existingCategoryId: c.existingCategoryId,
            resolution: c.resolution,
            isDuplicate: c.isDuplicate
          });
        }
        
        return shouldInclude;
      })
      .map(c => c.existingCategoryId!);

    logger.debug('[ImportCategories] Processando importação:', {
      total: importedData.length,
      categoriesToAdd: categoriesToAdd.length,
      categoriesToReplaceIds: categoriesToReplaceIds.length,
      categoriesToReplaceDetails: categoriesToReplaceIds,
      excluded: excludedIndexes.size
    });

    if (categoriesToAdd.length === 0 && categoriesToReplaceIds.length === 0) {
      logger.error('[ImportCategories] Nenhum item válido para importar!', {
        importedData,
        excludedIndexes: Array.from(excludedIndexes)
      });
      toast({
        title: 'Erro',
        description: 'Nenhum item válido para importar',
        variant: "destructive",
      });
      return;
    }

    onImportCategories(categoriesToAdd, categoriesToReplaceIds);
    
    toast({
      title: 'Sucesso',
      description: `${categoriesToAdd.length} categoria(s) importada(s) com sucesso`,
    });

    // Reset
    setFile(null);
    setImportedData([]);
    setExcludedIndexes(new Set());
    onOpenChange(false);
  };

  const handleCancel = () => {
    setFile(null);
    setImportedData([]);
    setExcludedIndexes(new Set());
    onOpenChange(false);
  };

  const handleToggleExclude = (index: number) => {
    setExcludedIndexes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleResolutionChange = (rowIndex: number, resolution: 'skip' | 'add' | 'replace') => {
    setImportedData(prev => prev.map((row, idx) => 
      idx === rowIndex ? { ...row, resolution } : row
    ));
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();
    
    const templateData = [
      {
        'Nome': 'Salário',
        'Tipo': 'Receita',
        'Cor': '#22c55e'
      },
      {
        'Nome': 'Alimentação',
        'Tipo': 'Despesa',
        'Cor': '#ef4444'
      },
      {
        'Nome': 'Investimentos',
        'Tipo': 'Ambos',
        'Cor': '#3b82f6'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    const colWidths = [
      { wch: 30 }, // Nome
      { wch: 15 }, // Tipo
      { wch: 15 }, // Cor
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'modelo-importacao-categorias.xlsx');

    toast({
      title: 'Sucesso',
      description: 'Modelo de exemplo baixado com sucesso',
    });
  };

  const summary = useMemo(() => {
    return importedData.reduce((acc, c, index) => {
      if (excludedIndexes.has(index)) {
        acc.excluded++;
      } else if (!c.isValid) {
        acc.invalid++;
      } else if (c.isDuplicate) {
        acc.duplicates++;
      } else {
        acc.new++;
      }
      return acc;
    }, { new: 0, duplicates: 0, invalid: 0, excluded: 0 });
  }, [importedData, excludedIndexes]);

  const categoriesToImportCount = useMemo(() => {
    return importedData.filter((c, index) => 
      !excludedIndexes.has(index) && 
      c.isValid && 
      (c.resolution === 'add' || c.resolution === 'replace')
    ).length;
  }, [importedData, excludedIndexes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Categorias
          </DialogTitle>
          <DialogDescription>
            Importe categorias em lote a partir de um arquivo Excel
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selecionar Arquivo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    disabled={isProcessing}
                    className="flex-1"
                  />
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" />
                      {file.name}
                    </div>
                  )}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p><strong>Formato esperado:</strong> O arquivo deve ter as colunas:</p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li><strong>Nome:</strong> Nome da categoria</li>
                        <li><strong>Tipo:</strong> Receita, Despesa ou Ambos</li>
                        <li><strong>Cor:</strong> Cor em hexadecimal (ex: #22c55e)</li>
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadTemplate()}
                        className="mt-2"
                      >
                        Baixar Modelo de Exemplo
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {importedData.length > 0 && (
            <ImportSummaryCards summary={summary} />
          )}

          {/* Banner de Ação para Duplicadas */}
          {importedData.length > 0 && summary.duplicates > 0 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30" ref={previewSectionRef}>
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                <div className="space-y-2">
                  <p className="font-semibold text-base">
                    Duplicatas Encontradas: {summary.duplicates} categorias
                  </p>
                  <p className="text-sm">
                    Para cada item duplicado, escolha uma ação clicando no menu ao lado: <strong>Pular</strong> (ignorar), <strong>Adicionar</strong> (criar novo) ou <strong>Substituir</strong> (sobrescrever existente).
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview List */}
          {importedData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prévia das Categorias ({importedData.length} total)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {importedData.map((category, index) => {
                    const isExcluded = excludedIndexes.has(index);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-3 space-y-2 ${
                          isExcluded ? "opacity-50 bg-muted/50" : "bg-card"
                        }`}
                      >
                        {/* Header: Status + Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExcluded ? (
                              <Badge variant="outline" className="bg-muted text-xs shrink-0">Excluída</Badge>
                            ) : !category.isValid ? (
                              <Badge variant="destructive" className="text-xs shrink-0">Erro</Badge>
                            ) : category.isDuplicate ? (
                              <Badge variant="secondary" className="bg-warning/10 text-warning text-xs shrink-0">Duplicata</Badge>
                            ) : (
                              <Badge variant="default" className="bg-success/10 text-success text-xs shrink-0">Nova</Badge>
                            )}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {category.cor && isValidColor(category.cor) && (
                                <div 
                                  className="w-5 h-5 rounded-full border shrink-0"
                                  style={{ backgroundColor: category.cor }}
                                  title={category.cor}
                                />
                              )}
                              <span className="font-medium text-sm truncate" title={category.nome}>
                                {category.nome}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant={isExcluded ? "outline" : "ghost"}
                              size="sm"
                              onClick={() => handleToggleExclude(index)}
                              className="h-7 px-2"
                              title={isExcluded ? "Incluir" : "Excluir"}
                            >
                              {isExcluded ? <PlusCircle className="h-3.5 w-3.5" /> : "×"}
                            </Button>
                            
                            {!isExcluded && category.isDuplicate && category.isValid && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 px-2">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-50 bg-popover">
                                  <DropdownMenuItem onClick={() => handleResolutionChange(index, 'skip')}>
                                    Pular (ignorar)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResolutionChange(index, 'add')}>
                                    Adicionar como nova
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleResolutionChange(index, 'replace')} 
                                    className="text-destructive"
                                  >
                                    Substituir existente
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="ml-1 font-medium">{category.tipo}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cor:</span>
                            <span className="ml-1 font-mono text-[10px]">{category.cor}</span>
                          </div>
                        </div>

                        {/* Resolution Badge for Duplicates */}
                        {!isExcluded && category.isDuplicate && (
                          <div className="pt-1 border-t">
                            <span className="text-xs text-muted-foreground">Ação: </span>
                            {category.resolution === 'skip' && (
                              <Badge variant="outline" className="text-xs">Pular</Badge>
                            )}
                            {category.resolution === 'add' && (
                              <Badge variant="default" className="bg-primary/10 text-primary text-xs">Adicionar nova</Badge>
                            )}
                            {category.resolution === 'replace' && (
                              <Badge variant="destructive" className="text-xs">Substituir</Badge>
                            )}
                          </div>
                        )}

                        {/* Errors */}
                        {!isExcluded && !category.isValid && category.errors.length > 0 && (
                          <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-3 w-3" />
                            <AlertDescription className="text-xs">
                              <div className="space-y-0.5">
                                {category.errors.map((error, i) => (
                                  <div key={i}>• {error}</div>
                                ))}
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport}
            disabled={categoriesToImportCount === 0 || isProcessing}
          >
            Importar {categoriesToImportCount} categoria{categoriesToImportCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
