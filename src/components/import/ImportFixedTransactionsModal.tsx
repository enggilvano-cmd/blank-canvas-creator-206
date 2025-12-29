import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useQueryInvalidation } from "@/hooks/useQueryInvalidation";
import { logger } from "@/lib/logger";
import { loadXLSX } from "@/lib/lazyImports";
import { Upload, FileSpreadsheet, AlertCircle, Download, MoreVertical, PlusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImportSummaryCards } from "@/components/import/ImportSummaryCards";

import { Category } from "@/types";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
}

interface ImportFixedTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  accounts: Account[];
  categories: Category[];
}

interface ImportedFixedTransaction {
  descricao: string;
  valor: number;
  tipo: string;
  conta: string;
  categoria: string;
  diaDoMes: number;
  mesesGerados?: number;
  isProvision: boolean;
  isValid: boolean;
  errors: string[];
  accountId?: string;
  parsedType?: 'income' | 'expense';
  isDuplicate: boolean;
  existingTransactionId?: string;
  resolution: 'skip' | 'add' | 'replace';
}

export function ImportFixedTransactionsModal({
  open,
  onOpenChange,
  onImportComplete,
  accounts,
  categories,
}: ImportFixedTransactionsModalProps) {
    interface ExistingTransaction {
    id: string;
    description: string;
    account_id: string;
    amount: number;
    date: string;
    type: string;
    category_id: string;
    is_provision?: boolean;
  }  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importedData, setImportedData] = useState<ImportedFixedTransaction[]>([]);
  const [excludedIndexes, setExcludedIndexes] = useState<Set<number>>(new Set());
  const [existingTransactions, setExistingTransactions] = useState<ExistingTransaction[]>([]);
  const { toast } = useToast();
  const { invalidateTransactions } = useQueryInvalidation();

  // Normalizar string para comparação
  const normalizeString = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  // Validar tipo de transação
  const validateTransactionType = (tipo: string): 'income' | 'expense' | null => {
    const normalizedType = normalizeString(tipo);
    if (['receita', 'receitas', 'income', 'entrada', 'entradas'].includes(normalizedType)) return 'income';
    if (['despesa', 'despesas', 'expense', 'expenses', 'saida', 'saidas'].includes(normalizedType)) return 'expense';
    return null;
  };

  // Validar status - REMOVIDO pois não é mais usado na importação/exportação
  // const validateStatus = ...

  // Encontrar conta por nome
  const findAccountByName = (accountName: string): Account | null => {
    const normalizedName = normalizeString(accountName);
    return accounts.find(acc => normalizeString(acc.name) === normalizedName) || null;
  };

  // Extrair valor da célula (suporta diferentes formatos)
  const extractValue = (row: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
      // Tentativa direta
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
      
      // Busca insensível a maiúsculas/minúsculas, espaços e acentos
      const normalizedKey = normalizeString(key);
      for (const rowKey of Object.keys(row)) {
        if (normalizeString(rowKey) === normalizedKey) {
           const val = row[rowKey];
           if (val !== undefined && val !== null && val !== '') {
             return val;
           }
        }
      }
    }
    return '';
  };

  // Carregar transações fixas existentes
  const loadExistingTransactions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_fixed", true)
        .is("parent_transaction_id", null);

      if (error) throw error;
      setExistingTransactions((data || []) as any);
    } catch (error) {
      logger.error("Error loading existing fixed transactions:", error);
    }
  };

  // Validar e verificar duplicata
  const validateAndCheckDuplicate = (row: Record<string, unknown>): ImportedFixedTransaction => {
    const errors: string[] = [];
    let isValid = true;

    const descricao = String(extractValue(row, ['Descrição', 'Description', 'descricao', 'description']) || '');
    
    // Parse valor com suporte robusto para formato brasileiro e numérico
    // Se vier como número do Excel, usa direto; se vier como string, trata formatação
    // IMPORTANTE: Arredondar para 2 casas decimais para evitar erros de precisão de ponto flutuante
    const rawValorOriginal = extractValue(row, ['Valor', 'Amount', 'valor', 'amount']);
    let valor: number;

    if (typeof rawValorOriginal === 'number') {
      // Valor já é número (vem direto do Excel) - arredondar para 2 casas decimais
      // Usa Math.round(x * 100) / 100 para garantir precisão
      valor = Math.round(Math.abs(rawValorOriginal) * 100) / 100;
    } else {
      // Valor é string - precisa fazer parse
      const rawValor = String(rawValorOriginal || '0').trim();
      // Remove símbolos de moeda e mantém apenas números, vírgula, ponto e menos
      const cleanValor = rawValor.replace(/[^0-9,.-]/g, '');
      
      const lastComma = cleanValor.lastIndexOf(',');
      const lastDot = cleanValor.lastIndexOf('.');

      let normalizedValue: string;

      if (lastComma > lastDot) {
        // Formato brasileiro: 1.234,56 -> remove pontos e substitui vírgula por ponto
        normalizedValue = cleanValor.replace(/\./g, '').replace(',', '.');
      } else if (lastDot > lastComma) {
        // Formato americano: 1,234.56 -> remove vírgulas
        normalizedValue = cleanValor.replace(/,/g, '');
      } else if (lastComma === -1 && lastDot === -1) {
        // Sem separadores
        normalizedValue = cleanValor;
      } else {
        // Caso com apenas um separador
        if (lastComma !== -1 && lastDot === -1) {
          normalizedValue = cleanValor.replace(',', '.');
        } else {
          normalizedValue = cleanValor;
        }
      }

      const parsed = parseFloat(normalizedValue);
      // Arredondar para 2 casas decimais para evitar erros de precisão de ponto flutuante
      valor = Math.round(Math.abs(parsed) * 100) / 100;
    }
    
    const tipo = String(extractValue(row, ['Tipo', 'Type', 'tipo', 'type']) || '');
    const conta = String(extractValue(row, ['Conta', 'Account', 'conta', 'account']) || '');
    const categoria = String(extractValue(row, ['Categoria', 'Category', 'categoria', 'category']) || '');
    const diaDoMes = parseInt(String(extractValue(row, ['Dia do Mês', 'Day of Month', 'diaDoMes', 'dia']) || '0'));
    const mesesGerados = parseInt(String(extractValue(row, ['Meses Gerados', 'Generated Months', 'mesesGerados', 'meses']) || '0'));
    
    const rawProvisao = String(extractValue(row, ['Provisão', 'Provision', 'provisao', 'provision', 'is_provision', 'provisionado', 'é provisão', 'e provisao']) || '');
    const isProvision = ['sim', 'yes', 'true', 'verdadeiro', '1', 's', 'y', 'ok'].includes(normalizeString(rawProvisao));

    // Validações
    if (!descricao) {
      errors.push('Descrição é obrigatória');
      isValid = false;
    }

    if (isNaN(valor) || valor <= 0) {
      errors.push('Valor inválido (deve ser > 0)');
      isValid = false;
    }

    if (!tipo) {
      errors.push('Tipo é obrigatório');
      isValid = false;
    }

    if (!conta) {
      errors.push('Conta é obrigatória');
      isValid = false;
    }

    if (!categoria) {
      errors.push('Categoria é obrigatória');
      isValid = false;
    }

    if (isNaN(diaDoMes) || diaDoMes < 1 || diaDoMes > 31) {
      errors.push('Dia do mês inválido (1-31)');
      isValid = false;
    }

    const parsedType = validateTransactionType(tipo);
    if (!parsedType) {
      errors.push('Tipo inválido (use: Receita ou Despesa)');
      isValid = false;
    }

    const account = findAccountByName(conta);
    if (!account && conta) {
      errors.push('Conta não encontrada');
      isValid = false;
    }

    // Verificar duplicata
    let isDuplicate = false;
    let existingTransactionId: string | undefined;

    if (isValid && account) {
      // valor está em REAIS, tx.amount também está em REAIS (do banco)
      const valorInReais = Math.abs(valor);
      const existing = existingTransactions.find(tx => {
        const isSameDescription = normalizeString(tx.description) === normalizeString(descricao);
        const isSameAccount = tx.account_id === account.id;
        
        // Comparação de data segura (string split)
        const txDay = parseInt(tx.date.split('-')[2], 10);
        const isSameDay = txDay === diaDoMes;

        // Comparação de tipo
        const isSameType = tx.type === parsedType;

        // Comparação de categoria (se possível resolver)
        let isSameCategory = true;
        if (categoria && categories.length > 0) {
           const categoryId = categories.find(c => normalizeString(c.name) === normalizeString(categoria))?.id;
           if (categoryId) {
             isSameCategory = tx.category_id === categoryId;
           }
        }
        
        return isSameDescription && isSameAccount && isSameDay && isSameType && isSameCategory;
      });

      if (existing) {
        isDuplicate = true;
        existingTransactionId = existing.id;
      }
    }

    return {
      descricao,
      valor,
      tipo,
      conta,
      categoria,
      diaDoMes,
      mesesGerados,
      isProvision,
      isValid,
      errors,
      accountId: account?.id,
      parsedType: parsedType || undefined,
      isDuplicate,
      existingTransactionId,
      resolution: isDuplicate ? 'skip' : 'add',
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
        toast({
          title: "Arquivo inválido",
          description: "Selecione um arquivo Excel (.xlsx ou .xls)",
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile);
      setIsProcessing(true);

      try {
        // Carregar transações existentes
        await loadExistingTransactions();

        const XLSX = await loadXLSX();
        const data = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        if (rawData.length === 0) {
          toast({
            title: "Arquivo vazio",
            description: "O arquivo não contém dados para importar",
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }

        const validatedData = rawData.map((row: unknown) => 
          validateAndCheckDuplicate(row as Record<string, unknown>)
        );

        setImportedData(validatedData);

        const summary = validatedData.reduce((acc, t) => {
          if (!t.isValid) acc.invalid++;
          else if (t.isDuplicate) acc.duplicates++;
          else acc.new++;
          return acc;
        }, { new: 0, duplicates: 0, invalid: 0 });

        toast({
          title: "Arquivo processado",
          description: `${summary.new} novas, ${summary.duplicates} duplicadas, ${summary.invalid} com erros`,
        });

      } catch (error) {
        logger.error("Error processing file:", error);
        toast({
          title: "Erro ao processar arquivo",
          description: "Verifique o formato e tente novamente",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const downloadTemplate = async () => {
    try {
      const XLSX = await loadXLSX();
      
      const templateData = [
        {
          'Descrição': 'Aluguel',
          'Valor': 1500.00,
          'Tipo': 'Despesa',
          'Conta': accounts[0]?.name || 'Conta Corrente',
          'Categoria': 'Habitação',
          'Dia do Mês': 5,
          'Meses Gerados': 12,
          'Provisão': 'Não'
        },
        {
          'Descrição': 'Salário',
          'Valor': 5000.00,
          'Tipo': 'Receita',
          'Conta': accounts[0]?.name || 'Conta Corrente',
          'Categoria': 'Salário',
          'Dia do Mês': 1,
          'Meses Gerados': 0,
          'Provisão': 'Não'
        },
        {
          'Descrição': 'Internet',
          'Valor': 99.90,
          'Tipo': 'Despesa',
          'Conta': accounts[0]?.name || 'Conta Corrente',
          'Categoria': 'Serviços',
          'Dia do Mês': 10,
          'Meses Gerados': 0,
          'Provisão': 'Sim'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transações Fixas");

      // Configurar largura das colunas
      const colWidths = [
        { wch: 30 }, // Descrição
        { wch: 12 }, // Valor
        { wch: 12 }, // Tipo
        { wch: 25 }, // Conta
        { wch: 20 }, // Categoria
        { wch: 12 }, // Dia do Mês
        { wch: 15 }, // Meses Gerados
        { wch: 12 }  // Provisão
      ];
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, 'modelo-transacoes-fixas.xlsx');

      toast({
        title: "Modelo baixado",
        description: "O arquivo modelo foi baixado com sucesso",
      });
    } catch (error) {
      logger.error("Error downloading template:", error);
      toast({
        title: "Erro ao baixar modelo",
        description: "Não foi possível baixar o modelo de importação",
        variant: "destructive",
      });
    }
  };

  const handleImport = async () => {
    const transactionsToAdd = importedData
      .filter((t, index) => 
        !excludedIndexes.has(index) && 
        t.isValid && 
        (t.resolution === 'add' || t.resolution === 'replace')
      );

    const transactionsToReplaceIds = importedData
      .filter((t, index) => 
        !excludedIndexes.has(index) && 
        t.isValid && 
        t.isDuplicate && 
        t.resolution === 'replace' && 
        t.existingTransactionId
      )
      .map(t => t.existingTransactionId!);

    if (transactionsToAdd.length === 0 && transactionsToReplaceIds.length === 0) {
      toast({
        title: "Nenhuma transação para importar",
        description: "Selecione pelo menos uma transação válida",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Carregar categorias existentes
      const { data: existingCategories } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id);

      const categoryMap = new Map(existingCategories?.map(c => [normalizeString(c.name), c.id]) || []);

      // Coletar categorias únicas necessárias
      const uniqueCategoryNames = new Set(transactionsToAdd.map(t => t.categoria.trim()));
      const categoriesToCreate = Array.from(uniqueCategoryNames).filter(
        name => !categoryMap.has(normalizeString(name))
      );

      // Criar categorias em batch se necessário
      if (categoriesToCreate.length > 0) {
        const { data: newCategories, error: createError } = await supabase
          .from("categories")
          .insert(
            categoriesToCreate.map(name => ({
              user_id: user.id,
              name: name,
              type: 'both' as const,
              color: '#6b7280',
            }))
          )
          .select();

        if (createError) {
          logger.error("Error creating categories:", createError);
          throw createError;
        }

        // Adicionar ao mapa
        newCategories?.forEach(cat => categoryMap.set(normalizeString(cat.name), cat.id));
      }

      // Deletar transações marcadas para substituição
      if (transactionsToReplaceIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("transactions")
          .delete()
          .in("id", transactionsToReplaceIds)
          .eq("user_id", user.id);

        if (deleteError) throw deleteError;
      }

      // Criar transações fixas com delay para evitar rate limiting
      let successCount = 0;
      let errorCount = 0;

      // Helper para adicionar delay entre requests
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      for (const t of transactionsToAdd) {
        try {
          // Calcular a data inicial (dia do mês atual ou próximo mês)
          const today = new Date();
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          
          // A lógica deve ser importar no mês atual independente do dia
          let initialDate = new Date(currentYear, currentMonth, t.diaDoMes);
          
          // Ajustar se o dia não existe no mês atual (ex: 31 de Fev)
          if (initialDate.getMonth() !== currentMonth) {
            initialDate = new Date(currentYear, currentMonth + 1, 0);
          }

          // Calcular meses a gerar: completar o ano atual + 12 meses do ano seguinte
          // Total de meses = (12 - mês atual) + 12
          // Como a primeira transação (pai) já conta, subtraímos 1 para as filhas
          const monthsToGenerate = (12 - currentMonth) + 12 - 1;

          // t.valor já está arredondado para 2 casas decimais no parsing
          // Garantir novamente a precisão antes de enviar para a API
          const amountInReais = Math.round(Math.abs(t.valor) * 100) / 100;
          const categoryId = categoryMap.get(normalizeString(t.categoria)) || null;

          // Log detalhado para debug do valor
          logger.info(`[ImportFixed] Enviando transação: ${t.descricao}`, {
            valorOriginal: t.valor,
            amountInReais,
            tipo: typeof amountInReais
          });

          // Log para debug da provisão
          if (t.isProvision) {
            logger.info(`Importando transação com provisão: ${t.descricao}`, { isProvision: t.isProvision });
          }

          const { data, error } = await supabase.functions.invoke('atomic-create-fixed', {
            body: {
              description: t.descricao.trim(),
              amount: amountInReais,
              date: initialDate.toISOString().split('T')[0],
              type: t.parsedType,
              category_id: categoryId,
              account_id: t.accountId,
              status: 'pending',
              is_provision: !!t.isProvision, // Garante envio explícito do booleano
            },
          });

          if (error) {
            logger.error("Error creating fixed transaction:", error);
            errorCount++;
          } else if (data?.success) {
            // Se a transação tem meses extras gerados, criar as transações filhas adicionais
            if (data?.parent_id && t.accountId) {
              try {
                // Contar quantas transações filhas o atomic-create-fixed já criou
                const { count: existingCount, error: countError } = await supabase
                  .from("transactions")
                  .select("*", { count: 'exact', head: true })
                  .eq("parent_transaction_id", data.parent_id);

                if (!countError && existingCount !== null) {
                  // Calcular quantas transações adicionais precisamos criar
                  const additionalTransactions = monthsToGenerate - existingCount;

                  if (additionalTransactions > 0) {
                    // Buscar a última transação filha gerada
                    const { data: childTransactions, error: childError } = await supabase
                      .from("transactions")
                      .select("date")
                      .eq("parent_transaction_id", data.parent_id)
                      .order("date", { ascending: false })
                      .limit(1);

                    let lastDate: Date;
                    if (!childError && childTransactions && childTransactions.length > 0) {
                      lastDate = new Date(childTransactions[0].date);
                    } else {
                      lastDate = initialDate;
                    }

                    const transactionsToGenerate = [];

                    // Gerar apenas as transações extras necessárias
                    for (let i = 0; i < additionalTransactions; i++) {
                      const nextDate = new Date(
                        lastDate.getFullYear(),
                        lastDate.getMonth() + i + 1,
                        t.diaDoMes
                      );

                        // Ajustar para o dia correto do mês
                        const targetMonth = nextDate.getMonth();
                        nextDate.setDate(t.diaDoMes);

                        // Se o mês mudou, ajustar para o último dia do mês anterior
                        if (nextDate.getMonth() !== targetMonth) {
                          nextDate.setDate(0);
                        }

                        transactionsToGenerate.push({
                          description: t.descricao.trim(),
                          amount: amountInReais,
                          date: nextDate.toISOString().split("T")[0],
                          type: t.parsedType!,
                          category_id: categoryId,
                          account_id: t.accountId,
                          status: "pending" as const,
                          user_id: user.id,
                          is_fixed: false,
                          is_provision: t.isProvision,
                          parent_transaction_id: data.parent_id,
                        });
                      }

                      // Inserir as transações extras
                      if (transactionsToGenerate.length > 0) {
                        const { error: insertError } = await supabase
                          .from("transactions")
                          .insert(transactionsToGenerate);

                        if (insertError) {
                          logger.error("Error generating extra months:", insertError);
                        }
                      }
                  }
                }
              } catch (extraError) {
                logger.error("Error generating extra months:", extraError);
              }
            }
            successCount++;
          } else {
            errorCount++;
          }

          // Delay de 100ms entre requests para evitar rate limiting
          await delay(100);
        } catch (error) {
          logger.error("Error importing transaction:", error);
          errorCount++;
          // Delay mesmo em caso de erro
          await delay(100);
        }
      }

      toast({
        title: successCount > 0 ? "Importação concluída" : "Erro na importação",
        description: `${successCount} transação(ões) importada(s)${errorCount > 0 ? `, ${errorCount} com erro` : ''}`,
        variant: errorCount > 0 && successCount === 0 ? "destructive" : "default",
      });

      if (successCount > 0) {
        // Invalidar todas as queries relacionadas
        await invalidateTransactions();
        
        onImportComplete();
        setFile(null);
        setImportedData([]);
        setExcludedIndexes(new Set());
        onOpenChange(false);
      }
    } catch (error) {
      logger.error("Error importing fixed transactions:", error);
      toast({
        title: "Erro ao importar",
        description: error instanceof Error ? error.message : "Não foi possível importar as transações",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
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

  const summary = useMemo(() => {
    return importedData.reduce((acc, t, index) => {
      if (excludedIndexes.has(index)) {
        acc.excluded++;
      } else if (!t.isValid) {
        acc.invalid++;
      } else if (t.isDuplicate) {
        acc.duplicates++;
      } else {
        acc.new++;
      }
      return acc;
    }, { new: 0, duplicates: 0, invalid: 0, excluded: 0 });
  }, [importedData, excludedIndexes]);

  const transactionsToImportCount = useMemo(() => {
    return importedData.filter((t, index) => 
      !excludedIndexes.has(index) && 
      t.isValid && 
      (t.resolution === 'add' || t.resolution === 'replace')
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
            Importar Transações Fixas
          </DialogTitle>
          <DialogDescription>
            Importe transações fixas em lote a partir de um arquivo Excel
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selecionar Arquivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={importing || isProcessing}
                  className="cursor-pointer"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-muted rounded-md">
                    <FileSpreadsheet className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                )}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <AlertDescription>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-sm mb-2">Formato esperado:</p>
                      <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                        <li><strong>Descrição:</strong> Nome da transação fixa</li>
                        <li><strong>Valor:</strong> Valor numérico (ex: 1500.00)</li>
                        <li><strong>Tipo:</strong> Receita ou Despesa</li>
                        <li><strong>Conta:</strong> Nome da conta (deve existir)</li>
                        <li><strong>Categoria:</strong> Categoria da transação</li>
                        <li><strong>Dia do Mês:</strong> Número de 1 a 31</li>
                        <li><strong>Provisão:</strong> Sim ou Não (opcional)</li>
                      </ul>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadTemplate}
                      className="w-full sm:w-auto"
                      disabled={importing || isProcessing}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Modelo de Exemplo
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {importedData.length > 0 && (
            <ImportSummaryCards summary={summary} />
          )}

          {/* Banner de Ação para Duplicadas */}
          {importedData.length > 0 && summary.duplicates > 0 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                <div className="space-y-2">
                  <p className="font-semibold text-base">
                    Duplicatas Encontradas: {summary.duplicates} transações fixas
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
                <CardTitle>Prévia das Transações Fixas ({importedData.length} total)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {importedData.map((transaction, index) => {
                    const isExcluded = excludedIndexes.has(index);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-3 space-y-2 ${
                          isExcluded ? "opacity-50 bg-muted/50" : "bg-card"
                        }`}
                      >
                        {/* Header: Status + Description + Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExcluded ? (
                              <Badge variant="outline" className="bg-muted text-xs shrink-0">Excluída</Badge>
                            ) : !transaction.isValid ? (
                              <Badge variant="destructive" className="text-xs shrink-0">Erro</Badge>
                            ) : transaction.isDuplicate ? (
                              <Badge variant="secondary" className="bg-warning/10 text-warning text-xs shrink-0">Duplicata</Badge>
                            ) : (
                              <Badge variant="default" className="bg-success/10 text-success text-xs shrink-0">Nova</Badge>
                            )}
                            <span className="font-medium text-sm truncate" title={transaction.descricao}>
                              {transaction.descricao}
                            </span>
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
                            
                            {!isExcluded && transaction.isDuplicate && transaction.isValid && (
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="ml-1 font-medium">R$ {transaction.valor.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Dia:</span>
                            <span className="ml-1 font-medium">{transaction.diaDoMes}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="ml-1 font-medium capitalize">{transaction.tipo}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Conta:</span>
                            <span className="ml-1 font-medium truncate" title={transaction.conta}>{transaction.conta}</span>
                          </div>
                        </div>

                        {/* Additional Info */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                          {transaction.categoria && (
                            <div>
                              <span className="text-muted-foreground">Categoria:</span>
                              <span className="ml-1 truncate" title={transaction.categoria}>{transaction.categoria}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Provisão:</span>
                            <span className="ml-1">{transaction.isProvision ? 'Sim' : 'Não'}</span>
                          </div>
                        </div>

                        {/* Resolution Badge for Duplicates */}
                        {!isExcluded && transaction.isDuplicate && (
                          <div className="pt-1 border-t">
                            <span className="text-xs text-muted-foreground">Ação: </span>
                            {transaction.resolution === 'skip' && (
                              <Badge variant="outline" className="text-xs">Pular</Badge>
                            )}
                            {transaction.resolution === 'add' && (
                              <Badge variant="default" className="bg-primary/10 text-primary text-xs">Adicionar nova</Badge>
                            )}
                            {transaction.resolution === 'replace' && (
                              <Badge variant="destructive" className="text-xs">Substituir</Badge>
                            )}
                          </div>
                        )}

                        {/* Errors */}
                        {!isExcluded && !transaction.isValid && transaction.errors.length > 0 && (
                          <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-3 w-3" />
                            <AlertDescription className="text-xs">
                              <div className="space-y-0.5">
                                {transaction.errors.map((error, i) => (
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

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} disabled={importing || isProcessing}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport}
            disabled={transactionsToImportCount === 0 || importing || isProcessing}
          >
            Importar {transactionsToImportCount} transação{transactionsToImportCount !== 1 ? 'ões' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
