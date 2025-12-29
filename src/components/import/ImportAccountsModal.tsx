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
import { formatCurrency } from "@/lib/formatters";
import type { ImportAccountData } from '@/types';
import { ImportSummaryCards } from "@/components/import/ImportSummaryCards";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance: number;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
  color: string;
}

interface ImportAccountsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onImportAccounts: (accounts: ImportAccountData[], accountsToReplace: string[]) => void;
}

interface ImportedAccount {
  nome: string;
  tipo: string;
  saldo: number;
  limite: number;
  fechamento: number;
  vencimento: number;
  cor: string;
  isValid: boolean;
  errors: string[];
  parsedType?: 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher';
  isDuplicate: boolean;
  existingAccountId?: string;
  resolution: 'skip' | 'add' | 'replace';
}

export function ImportAccountsModal({ 
  open, 
  onOpenChange, 
  accounts,
  onImportAccounts 
}: ImportAccountsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importedData, setImportedData] = useState<ImportedAccount[]>([]);
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

  const validateAccountType = (tipo: string): 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher' | null => {
    const normalizedType = tipo.toLowerCase().trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    // Conta Corrente / Checking
    if (normalizedType.includes('corrente') || 
        normalizedType.includes('conta corr') ||
        normalizedType.includes('checking') ||
        normalizedType === 'checking' ||
        normalizedType === 'cc') return 'checking';
    
    // Poupança / Savings
    if (normalizedType.includes('poupanca') || 
        normalizedType.includes('poupança') ||
        normalizedType.includes('saving') ||
        normalizedType === 'savings' ||
        normalizedType === 'pp') return 'savings';
    
    // Cartão de Crédito / Credit Card
    if (normalizedType.includes('cartao') || 
        normalizedType.includes('credito') ||
        normalizedType.includes('credit') ||
        normalizedType.includes('card') ||
        normalizedType === 'credit' ||
        normalizedType === 'cc' ||
        normalizedType === 'cred') return 'credit';
    
    // Investimento / Investment
    if (normalizedType.includes('invest') ||
        normalizedType === 'inv') return 'investment';

    // Vale Refeição/Alimentação / Meal Voucher
    if (normalizedType.includes('vale') ||
        normalizedType.includes('refeicao') ||
        normalizedType.includes('alimentacao') ||
        normalizedType.includes('meal') ||
        normalizedType.includes('voucher') ||
        normalizedType === 'vr' ||
        normalizedType === 'va') return 'meal_voucher';
    
    return null;
  };
  const isValidColor = (color: string): boolean => {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
  };

  const parseNumber = (value: unknown): number => {
    if (typeof value === 'number') return Math.round(value * 100);
    if (typeof value === 'string') {
      // Parse com suporte ao formato brasileiro (ponto = milhar, vírgula = decimal)
      // Remove pontos (separador de milhar) e substitui vírgula por ponto (decimal)
      const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(cleaned);
      // Converte para centavos
      return isNaN(parsed) ? 0 : Math.round(parsed * 100);
    }
    return 0;
  };

  // Suporte a cabeçalhos exportados em diferentes idiomas
  const pick = (row: Record<string, unknown>, keys: readonly string[]) => {
    for (const key of keys) {
      const candidates = [key, key.toLowerCase()];
      for (const c of candidates) {
        if (row[c] !== undefined && row[c] !== null && `${row[c]}`.toString().trim() !== '') {
          return row[c];
        }
      }
    }
    return '';
  };

  const HEADERS = {
    name: ['Nome', 'Nome da Conta', 'Account Name', 'Nombre de la Cuenta', 'Name'],
    type: ['Tipo', 'Tipo de Conta', 'Account Type', 'Tipo de Cuenta', 'Type'],
    balance: ['Saldo', 'Balance'],
    limit: ['Limite', 'Limit'],
    closing: ['Fechamento', 'Dia de Fechamento', 'Closing Day', 'Día de Cierre'],
    due: ['Vencimento', 'Dia de Vencimento', 'Due Day', 'Día de Vencimiento'],
    color: ['Cor', 'Color']
  } as const;

  const validateAndCheckDuplicate = (row: Record<string, unknown>): ImportedAccount => {
    const errors: string[] = [];
    let isValid = true;

    // Usar o mapeador de cabeçalhos para suportar diferentes idiomas
    const nome = pick(row, HEADERS.name).toString().trim();
    const tipo = pick(row, HEADERS.type).toString().trim();
    const saldo = parseNumber(pick(row, HEADERS.balance) || 0);
    const limite = parseNumber(pick(row, HEADERS.limit) || 0);
    const fechamento = parseInt(pick(row, HEADERS.closing)?.toString() || '0') || 0;
    const vencimento = parseInt(pick(row, HEADERS.due)?.toString() || '0') || 0;
    const cor = pick(row, HEADERS.color).toString().trim();

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

    const parsedType = validateAccountType(tipo);
    if (!parsedType) {
      errors.push('Tipo de conta inválido. Use: Corrente, Poupança, Crédito, Investimento ou Vale Refeição/Alimentação');
      isValid = false;
    }

    if (cor && !isValidColor(cor)) {
      errors.push('Cor inválida. Use formato hexadecimal (ex: #FF0000)');
      isValid = false;
    }

    if (parsedType === 'credit') {
      if (fechamento && (fechamento < 1 || fechamento > 31)) {
        errors.push('Dia de fechamento deve estar entre 1 e 31');
        isValid = false;
      }
      if (vencimento && (vencimento < 1 || vencimento > 31)) {
        errors.push('Dia de vencimento deve estar entre 1 e 31');
        isValid = false;
      }
    }

    // Verificação de duplicata (por nome)
    let isDuplicate = false;
    let existingAccountId: string | undefined;
    
    if (isValid && nome) {
      const existingAccount = accounts.find(acc => 
        acc.name.trim().toLowerCase() === nome.toLowerCase()
      );

      if (existingAccount) {
        isDuplicate = true;
        existingAccountId = existingAccount.id;
      }
    }

    return {
      nome,
      tipo,
      saldo,
      limite,
      fechamento,
      vencimento,
      cor,
      isValid,
      errors,
      parsedType: parsedType || undefined,
      isDuplicate,
      existingAccountId,
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

  const handleImport = async () => {
    // Itens para adicionar: novos OU duplicatas com resolution='add' OU duplicatas com resolution='replace'
    const accountsToAdd = importedData
      .filter((a, index) => 
        !excludedIndexes.has(index) && 
        a.isValid && 
        (a.resolution === 'add' || a.resolution === 'replace')
      )
      .map(a => {
        // NÃO converter para centavos - os valores já estão no formato correto (centavos)
        const balance = Math.round(a.saldo);
        // Aceitar limite 0 como valor válido
        const limit = (a.limite !== undefined && a.limite !== null) ? Math.round(a.limite) : undefined;

        return {
          name: a.nome.trim(),
          type: a.parsedType as 'checking' | 'savings' | 'credit' | 'investment' | 'meal_voucher',
          balance: balance,
          limit_amount: limit,
          closing_date: a.parsedType === 'credit' && a.fechamento > 0 ? a.fechamento : undefined,
          due_date: a.parsedType === 'credit' && a.vencimento > 0 ? a.vencimento : undefined,
          color: a.cor.toUpperCase(),
        };
      });

    const accountsToReplaceIds = importedData
      .filter((a, index) => {
        const shouldInclude = !excludedIndexes.has(index) && 
          a.isValid && 
          a.isDuplicate && 
          a.resolution === 'replace' && 
          a.existingAccountId;
        
        if (shouldInclude) {
          logger.debug('[ImportAccounts] Item marcado para substituição:', {
            index,
            nome: a.nome,
            existingAccountId: a.existingAccountId,
            resolution: a.resolution,
            isDuplicate: a.isDuplicate
          });
        }
        
        return shouldInclude;
      })
      .map(a => a.existingAccountId!);

    logger.debug('[ImportAccounts] Processando importação:', {
      total: importedData.length,
      accountsToAdd: accountsToAdd.length,
      accountsToReplaceIds: accountsToReplaceIds.length,
      accountsToReplaceDetails: accountsToReplaceIds,
      excluded: excludedIndexes.size,
      firstAccountSample: accountsToAdd[0]
    });

    if (accountsToAdd.length === 0 && accountsToReplaceIds.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum item válido para importar',
        variant: "destructive",
      });
      return;
    }

    try {
      // Chama a função de importação e aguarda
      await onImportAccounts(accountsToAdd, accountsToReplaceIds);
      
      // Só mostra toast de sucesso se não houver erro
      // (o toast de sucesso já é mostrado pelo useAccountHandlers)
      
      // Reset
      setFile(null);
      setImportedData([]);
      setExcludedIndexes(new Set());
      onOpenChange(false);
    } catch (error) {
      // Erro já foi tratado pelo useAccountHandlers
      logger.error('[ImportAccounts] Erro ao importar:', error);
    }
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
        'Nome': 'Conta Corrente Principal',
        'Tipo': 'Conta Corrente',
        'Saldo': 5000.00,
        'Limite': 0,
        'Fechamento': '',
        'Vencimento': '',
        'Cor': '#3b82f6'
      },
      {
        'Nome': 'Poupança',
        'Tipo': 'Poupança',
        'Saldo': 10000.00,
        'Limite': 0,
        'Fechamento': '',
        'Vencimento': '',
        'Cor': '#22c55e'
      },
      {
        'Nome': 'Cartão Visa',
        'Tipo': 'Cartão de Crédito',
        'Saldo': -1500.00,
        'Limite': 5000.00,
        'Fechamento': 15,
        'Vencimento': 25,
        'Cor': '#ef4444'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    const colWidths = [
      { wch: 30 }, // Nome
      { wch: 20 }, // Tipo
      { wch: 15 }, // Saldo
      { wch: 15 }, // Limite
      { wch: 12 }, // Fechamento
      { wch: 12 }, // Vencimento
      { wch: 12 }, // Cor
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'modelo-importacao-contas.xlsx');

    toast({
      title: 'Sucesso',
      description: 'Modelo de exemplo baixado com sucesso',
    });
  };

  const summary = useMemo(() => {
    return importedData.reduce((acc, a, index) => {
      if (excludedIndexes.has(index)) {
        acc.excluded++;
      } else if (!a.isValid) {
        acc.invalid++;
      } else if (a.isDuplicate) {
        acc.duplicates++;
      } else {
        acc.new++;
      }
      return acc;
    }, { new: 0, duplicates: 0, invalid: 0, excluded: 0 });
  }, [importedData, excludedIndexes]);

  const accountsToImportCount = useMemo(() => {
    return importedData.filter((a, index) => 
      !excludedIndexes.has(index) && 
      a.isValid && 
      (a.resolution === 'add' || a.resolution === 'replace')
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
            Importar Contas
          </DialogTitle>
          <DialogDescription>
            Importe contas em lote a partir de um arquivo Excel
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
                        <li><strong>Nome:</strong> Nome da conta</li>
                        <li><strong>Tipo:</strong> Corrente, Poupança, Crédito ou Investimento</li>
                        <li><strong>Saldo:</strong> Saldo inicial da conta</li>
                        <li><strong>Limite:</strong> Limite de crédito (apenas para cartões)</li>
                        <li><strong>Fechamento:</strong> Dia de fechamento (1-31, apenas para cartões)</li>
                        <li><strong>Vencimento:</strong> Dia de vencimento (1-31, apenas para cartões)</li>
                        <li><strong>Cor:</strong> Cor em hexadecimal (ex: #3b82f6)</li>
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
                    Duplicatas Encontradas: {summary.duplicates} contas
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
                <CardTitle>Prévia das Contas ({importedData.length} total)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {importedData.map((account, index) => {
                    const isExcluded = excludedIndexes.has(index);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-3 space-y-2 ${
                          isExcluded ? "opacity-50 bg-muted/50" : "bg-card"
                        }`}
                      >
                        {/* Header: Status + Name + Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExcluded ? (
                              <Badge variant="outline" className="bg-muted text-xs shrink-0">Excluída</Badge>
                            ) : !account.isValid ? (
                              <Badge variant="destructive" className="text-xs shrink-0">Erro</Badge>
                            ) : account.isDuplicate ? (
                              <Badge variant="secondary" className="bg-warning/10 text-warning text-xs shrink-0">Duplicata</Badge>
                            ) : (
                              <Badge variant="default" className="bg-success/10 text-success text-xs shrink-0">Nova</Badge>
                            )}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {account.cor && isValidColor(account.cor) && (
                                <div 
                                  className="w-5 h-5 rounded-full border shrink-0"
                                  style={{ backgroundColor: account.cor }}
                                  title={account.cor}
                                />
                              )}
                              <span className="font-medium text-sm truncate" title={account.nome}>
                                {account.nome}
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
                            
                            {!isExcluded && account.isDuplicate && account.isValid && (
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="ml-1 font-medium capitalize">{account.tipo}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Saldo:</span>
                            <span className="ml-1 font-medium">{formatCurrency(account.saldo)}</span>
                          </div>
                          {account.limite > 0 && (
                            <div>
                              <span className="text-muted-foreground">Limite:</span>
                              <span className="ml-1 font-medium">{formatCurrency(account.limite)}</span>
                            </div>
                          )}
                        </div>

                        {/* Credit Card Specific */}
                        {account.tipo === 'credit' && (
                          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                            {account.fechamento && (
                              <div>
                                <span className="text-muted-foreground">Fechamento:</span>
                                <span className="ml-1 font-medium">Dia {account.fechamento}</span>
                              </div>
                            )}
                            {account.vencimento && (
                              <div>
                                <span className="text-muted-foreground">Vencimento:</span>
                                <span className="ml-1 font-medium">Dia {account.vencimento}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Resolution Badge for Duplicates */}
                        {!isExcluded && account.isDuplicate && (
                          <div className="pt-1 border-t">
                            <span className="text-xs text-muted-foreground">Ação: </span>
                            {account.resolution === 'skip' && (
                              <Badge variant="outline" className="text-xs">Pular</Badge>
                            )}
                            {account.resolution === 'add' && (
                              <Badge variant="default" className="bg-primary/10 text-primary text-xs">Adicionar nova</Badge>
                            )}
                            {account.resolution === 'replace' && (
                              <Badge variant="destructive" className="text-xs">Substituir</Badge>
                            )}
                          </div>
                        )}

                        {/* Errors */}
                        {!isExcluded && !account.isValid && account.errors.length > 0 && (
                          <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-3 w-3" />
                            <AlertDescription className="text-xs">
                              <div className="space-y-0.5">
                                {account.errors.map((error, i) => (
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
            disabled={accountsToImportCount === 0 || isProcessing}
          >
            Importar {accountsToImportCount} conta{accountsToImportCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
