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
import { parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createDateFromString } from "@/lib/dateUtils";
import type { ImportTransactionData } from '@/types';
import { ImportSummaryCards } from "@/components/import/ImportSummaryCards";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "meal_voucher";
  balance: number;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "income" | "expense" | "transfer";
  account_id: string;
  status: "pending" | "completed";
}

interface ImportTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  accounts: Account[];
  onImportTransactions: (transactions: ImportTransactionData[], transactionsToReplace: string[]) => void;
}

interface ImportedTransaction {
  data: string;
  descricao: string;
  categoria: string;
  tipo: string;
  conta: string;
  contaDestino?: string;
  valor: number;
  status?: string;
  parcelas?: string; // Mantido como string para leitura inicial
  invoiceMonth?: string;
  isFixed?: boolean;
  isProvision?: boolean;
  isValid: boolean;
  errors: string[];
  accountId?: string;
  toAccountId?: string;
  parsedDate?: Date;
  parsedType?: 'income' | 'expense' | 'transfer';
  parsedStatus?: 'completed' | 'pending';
  isDuplicate: boolean;
  existingTransactionId?: string;
  resolution: 'skip' | 'add' | 'replace'; // Ação para duplicatas
  id?: string;
  parentTransactionId?: string;
  linkedTransactionId?: string; // Campo adicionado para vincular pares de transferência
  linkedTransactionRef?: string; // Referência temporária do arquivo Excel (ID Vinculado)
}

export function ImportTransactionsModal({ 
  open, 
  onOpenChange, 
  transactions,
  accounts, 
  onImportTransactions 
}: ImportTransactionsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importedData, setImportedData] = useState<ImportedTransaction[]>([]);
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

  // Suporte a cabeçalhos exportados em diferentes idiomas
  const HEADERS = {
    date: ['Data', 'Date', 'Fecha', 'Data da Transação'],
    description: ['Descrição', 'Description', 'Descripción', 'Descrição da Transação'],
    category: ['Categoria', 'Category', 'Categoría', 'Categoria da Transação'],
    type: ['Tipo', 'Type', 'Tipo'],
    account: ['Conta', 'Account', 'Cuenta', 'Conta de Origem'],
    toAccount: ['Conta Destino', 'To Account', 'Cuenta Destino', 'Conta de Destino'],
    amount: ['Valor', 'Amount', 'Valor', 'Valor (R$)', 'Value'],
    status: ['Status', 'Status', 'Estado'],
    installments: ['Parcelas', 'Installments', 'Cuotas'],
    invoiceMonth: ['Mês Fatura', 'Mes Fatura', 'Invoice Month', 'Mes Factura', 'Mês da Fatura', 'Mes da Fatura', 'InvoiceMonth', 'MesFatura']
  } as const;

  const pick = (row: Record<string, unknown>, keys: readonly string[]) => {
    if (!row || typeof row !== 'object') return '';
    if (!keys || !Array.isArray(keys)) return '';
    
    // Mapa normalizado de chaves do Excel -> valor
    const keyMap = new Map<string, unknown>();
    const rowKeys = Object.keys(row);
    
    for (const k of rowKeys) {
      if (typeof k === 'string') {
        keyMap.set(normalizeKey(k), row[k]);
      }
    }
    
    // Converter para array regular para garantir iterabilidade
    const keysArray = Array.from(keys);
    
    for (const key of keysArray) {
      if (typeof key === 'string') {
        const candidates = [key, key.toLowerCase()];
        for (const c of candidates) {
          const nk = normalizeKey(c);
          if (keyMap.has(nk)) {
            return keyMap.get(nk);
          }
        }
      }
    }
    return '';
  };

  // Função para normalizar strings (remover acentos, espaços extras, etc.)
  const normalizeString = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
      .replace(/\s+/g, ' '); // Normaliza espaços
  };
  const normalizeKey = (str: string): string => normalizeString(str).replace(/[^a-z0-9]/g, '');

  const validateTransactionType = (tipo: string): 'income' | 'expense' | 'transfer' | null => {
    const normalizedType = normalizeString(tipo);
    // Suporte para PT-BR, EN-US, ES-ES (singular e plural)
    if (['receita', 'receitas', 'income', 'entrada', 'entradas', 'ingreso', 'ingresos'].includes(normalizedType)) return 'income';
    if (['despesa', 'despesas', 'expense', 'expenses', 'saida', 'saidas', 'gasto', 'gastos'].includes(normalizedType)) return 'expense';
    if (['transferencia', 'transfer', 'transferir'].includes(normalizedType)) return 'transfer';
    return null;
  };

  const validateStatus = (status: string): 'completed' | 'pending' | null => {
    if (!status) return 'completed'; // padrão
    const normalizedStatus = normalizeString(status);
    // Suporte para PT-BR, EN-US, ES-ES
    if (['concluida', 'completed', 'finalizada', 'completada'].includes(normalizedStatus)) return 'completed';
    if (['pendente', 'pending', 'em andamento'].includes(normalizedStatus)) return 'pending';
    return null;
  };

  const findAccountByName = (accountName: string): Account | null => {
    const normalizedName = accountName.toLowerCase().trim();
    // Busca por correspondência exata para evitar ambiguidades
    return accounts.find(acc => acc.name.toLowerCase().trim() === normalizedName) || null;
  };

  const parseInvoiceMonth = (value: unknown): string | undefined => {
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
      try {
        if (!value) return undefined;
        
        // Se for um número (serial date do Excel)
        if (typeof value === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const jsDate = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
          if (isValid(jsDate)) {
            const year = jsDate.getFullYear();
            const month = String(jsDate.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
          }
          return undefined;
        }
        
        // Se já for um objeto Date
        if (value instanceof Date && isValid(value)) {
          const year = value.getFullYear();
          const month = String(value.getMonth() + 1).padStart(2, '0');
          return `${year}-${month}`;
        }
        
        const str = String(value).trim();
        if (!str) return undefined;
        
        // Formato já correto: YYYY-MM
        if (/^\d{4}-\d{2}$/.test(str)) {
          return str;
        }
        
        // Formato: MM/YYYY ou MM-YYYY
        if (/^(\d{1,2})[/-](\d{4})$/.test(str)) {
          const match = str.match(/^(\d{1,2})[/-](\d{4})$/);
          if (match) {
            const month = match[1].padStart(2, '0');
            const year = match[2];
            return `${year}-${month}`;
          }
        }
        
        // Formato: YYYY/MM ou YYYY.MM
        if (/^(\d{4})[/.](\d{1,2})$/.test(str)) {
          const match = str.match(/^(\d{4})[/.](\d{1,2})$/);
          if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0');
            return `${year}-${month}`;
          }
        }
        
        // Formato: apenas MM (assumir ano atual)
        if (/^\d{1,2}$/.test(str)) {
          const month = str.padStart(2, '0');
          const currentYear = new Date().getFullYear();
          return `${currentYear}-${month}`;
        }
        
        // Formato brasileiro: mês abreviado/ano abreviado (ex: dez/25, jan/26)
        const monthAbbreviations: Record<string, string> = {
          'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
          'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
          'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
        };
        
        const brazilianMonthMatch = str.toLowerCase().match(/^([a-z]{3})[\/\-]?(\d{2,4})$/);
        if (brazilianMonthMatch) {
          const monthAbbr = brazilianMonthMatch[1];
          let yearStr = brazilianMonthMatch[2];
          
          if (monthAbbreviations[monthAbbr]) {
            // Se o ano tem 2 dígitos, expandir para 4
            if (yearStr.length === 2) {
              const currentCentury = Math.floor(new Date().getFullYear() / 100) * 100;
              const yearNum = parseInt(yearStr, 10);
              // Se o ano for menor que 50, assume século atual; senão, assume século anterior
              yearStr = String(yearNum < 50 ? currentCentury + yearNum : currentCentury - 100 + yearNum);
            }
            return `${yearStr}-${monthAbbreviations[monthAbbr]}`;
          }
        }
        
        // Tentar parsear como data e extrair ano-mês
        try {
          const parsed = parseDate(str);
          if (parsed && isValid(parsed)) {
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
          }
        } catch (e) {
          // Ignorar erro de parsing
        }
        
        return undefined;
      } catch (error) {
        logger.error('[ImportTx] Erro na função parseInvoiceMonth:', {
          value,
          error: error instanceof Error ? error.message : String(error)
        });
        return undefined;
      }
    }
  
    return undefined;
  };

  const parseDate = (dateString: string | number | null | undefined): Date | null => {
    if (typeof dateString === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const jsDate = new Date(excelEpoch.getTime() + dateString * 24 * 60 * 60 * 1000);
      return isValid(jsDate) ? jsDate : null;
    }

    if (typeof dateString === 'string') {
      const dateStr = dateString.trim();
      if (!dateStr) return null;

      const formats = [
        'dd/MM/yyyy',
        'dd.MM.yyyy',
        'dd/MM/yy',
        'yyyy-MM-dd',
        'MM/dd/yyyy',
        'dd-MM-yyyy',
        'yyyy/MM/dd',
        'd/M/yyyy',
        'd/M/yy'
      ];

      for (const dateFormat of formats) {
        try {
          const parsed = parse(dateStr, dateFormat, new Date(), { locale: ptBR });
          if (isValid(parsed)) {
            return parsed;
          }
        } catch (error) {
          continue;
        }
      }

      const autoDate = new Date(dateStr);
      return isValid(autoDate) ? autoDate : null;
    }

    return null;
  };

  // Adicionando logs detalhados para capturar informações de transações rejeitadas
  const validateAndCheckDuplicate = (row: Record<string, unknown>): ImportedTransaction => {
    const errors: string[] = [];
    let isValid = true;

    const dataRaw = pick(row, HEADERS.date);
    const data = dataRaw ? String(dataRaw) : '';
    const descricao = String(pick(row, HEADERS.description) || '');
    const categoria = String(pick(row, HEADERS.category) || '');
    const tipo = String(pick(row, HEADERS.type) || '');
    const conta = String(pick(row, HEADERS.account) || '');
    const contaDestino = String(pick(row, HEADERS.toAccount) || '');

    const rawValorOriginal = pick(row, HEADERS.amount);
    let valor: number;

    if (typeof rawValorOriginal === 'number') {
      valor = Math.abs(Math.round(rawValorOriginal * 100));
    } else {
      const rawValor = String(rawValorOriginal || '0').trim();
      // Remove currency symbols and other non-numeric chars, keeping , . -
      const cleanValor = rawValor.replace(/[^0-9,.-]/g, '');
      
      const lastComma = cleanValor.lastIndexOf(',');
      const lastDot = cleanValor.lastIndexOf('.');

      let normalizedValue: string;

      if (lastComma > lastDot) {
        normalizedValue = cleanValor.replace(/\./g, '').replace(',', '.');
      } else if (lastDot > lastComma) {
        normalizedValue = cleanValor.replace(/,/g, '');
      } else if (lastComma === -1 && lastDot === -1) {
        normalizedValue = cleanValor;
      } else {
        if (lastComma !== -1 && lastDot === -1) {
          normalizedValue = cleanValor.replace(',', '.');
        } else {
          normalizedValue = cleanValor;
        }
      }

      valor = Math.abs(Math.round(parseFloat(normalizedValue) * 100));
    }

    if (!data) {
      errors.push('Data é obrigatória');
      isValid = false;
    }

    if (!descricao) {
      errors.push('Descrição é obrigatória');
      isValid = false;
    }

    if (!categoria) {
      errors.push('Categoria é obrigatória');
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

    if (isNaN(valor)) {
      errors.push('Valor inválido. Deve ser um número');
      isValid = false;
      logger.debug('[ImportTx] Valor inválido:', {
        raw: rawValorOriginal,
        tipo: typeof rawValorOriginal,
        processado: valor
      });
    } else if (valor <= 0) {
      errors.push('Valor deve ser maior que zero');
      isValid = false;
    }

    const parsedDate = parseDate(dataRaw as string | number | null | undefined);
    if (!parsedDate) {
      errors.push('Formato de data inválido. Use dd/MM/yyyy ou deixe o Excel formatar como data');
      isValid = false;
    }

    const parsedType = validateTransactionType(tipo);
    if (!parsedType) {
      errors.push('Tipo inválido. Use: Receita, Despesa ou Transferência');
      isValid = false;
    }

    const account = findAccountByName(conta);
    const accountId = account?.id;
    if (!account) {
      errors.push('Conta não encontrada. Verifique se a conta existe');
      isValid = false;
    }

    let toAccountId: string | undefined;
    if (parsedType === 'transfer') {
      if (contaDestino) {
        const toAccount = findAccountByName(contaDestino);
        if (toAccount) {
          toAccountId = toAccount.id;
        } else {
          errors.push(`Conta destino '${contaDestino}' não encontrada.`);
          isValid = false;
        }
      }
    }

    const statusStr = String(pick(row, HEADERS.status) || 'completed');
    const parsedStatus = validateStatus(statusStr);
    if (!parsedStatus) {
      errors.push('Status inválido. Use: Concluída ou Pendente');
      isValid = false;
    }

    const invoiceMonthRaw = pick(row, HEADERS.invoiceMonth);
    const invoiceMonth = parseInvoiceMonth(invoiceMonthRaw);

    // Log para debug do mês da fatura
    if (invoiceMonthRaw) {
      logger.debug('[ImportTx] Mês da fatura detectado:', {
        raw: invoiceMonthRaw,
        tipo: typeof invoiceMonthRaw,
        parsed: invoiceMonth
      });
    }

    if (invoiceMonthRaw && !invoiceMonth) {
      logger.debug('[ImportTx] Falha ao parsear mês da fatura:', {
        raw: invoiceMonthRaw,
        tipo: typeof invoiceMonthRaw
      });
      errors.push('Aviso: Formato de mês de fatura inválido. Use YYYY-MM ou MM/YYYY. Campo será ignorado.');
    }

    const isFixed = false;
    const isProvision = false;

    const normalizeToUTCDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));

    let isDuplicate = false;
    let existingTransactionId: string | undefined;
    if (isValid && parsedDate && accountId) {
      const valorInCents = Math.abs(valor);
      const parsedNorm = normalizeToUTCDate(parsedDate);

      const existingTx = transactions.find(tx => {
        const txDate = createDateFromString(tx.date);
        const isSameDate = 
          txDate.getUTCFullYear() === parsedNorm.getUTCFullYear() &&
          txDate.getUTCMonth() === parsedNorm.getUTCMonth() &&
          txDate.getUTCDate() === parsedNorm.getUTCDate();
        const isSameAmount = Math.abs(tx.amount) === valorInCents;
        const isSameDescription = (tx.description || '').trim().toLowerCase() === String(descricao).trim().toLowerCase();
        const isSameAccount = tx.account_id === accountId;
        return isSameAccount && isSameDate && isSameAmount && isSameDescription;
      });

      if (existingTx) {
        isDuplicate = true;
        existingTransactionId = existingTx.id;
      }
    }

    if (!isValid) {
      logger.debug('[ImportTx] Transação rejeitada:', {
        data,
        descricao,
        categoria,
        tipo,
        conta,
        contaDestino,
        valor,
        status: statusStr,
        parcelas: String(pick(row, HEADERS.installments) || ''),
        invoiceMonth,
        errors
      });
    }

    return {
      data,
      descricao,
      categoria,
      tipo,
      conta,
      contaDestino,
      valor: valor,
      status: statusStr,
      parcelas: String(pick(row, HEADERS.installments) || ''),
      invoiceMonth,
      isFixed,
      isProvision,
      isValid,
      errors,
      accountId: accountId,
      toAccountId,
      parsedDate: parsedDate || undefined,
      parsedType: parsedType || undefined,
      parsedStatus: parsedStatus || undefined,
      isDuplicate,
      existingTransactionId,
      resolution: isDuplicate ? 'skip' : 'add',
    };
  };

  // Adicionando melhorias para validação inicial e otimização de desempenho
  const validateHeaders = (headers: string[]): string[] => {
    const requiredHeaders = [
      normalizeKey('Data'),
      normalizeKey('Descrição'),
      normalizeKey('Categoria'),
      normalizeKey('Tipo'),
      normalizeKey('Conta'),
      normalizeKey('Valor')
    ];

    return requiredHeaders.filter(h => !headers.includes(h));
  };

  const processFile = async (file: File) => {
    const XLSX = await loadXLSX();
    const fileBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error('O arquivo está vazio ou não contém dados válidos.');
    }

    const headers = Object.keys(rawData[0] as object).map(k => normalizeKey(String(k)));
    const missingHeaders = validateHeaders(headers);

    if (missingHeaders.length > 0) {
      throw new Error(`Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}`);
    }

    return rawData;
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
      const rawData = await processFile(selectedFile);
      const validatedData = rawData.map((row: unknown) => validateAndCheckDuplicate(row as Record<string, unknown>));

      setImportedData(validatedData);

      const summary = validatedData.reduce((acc: { new: number; duplicates: number; invalid: number }, t: ImportedTransaction) => {
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
        title: 'Erro ao processar arquivo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = () => {
    // Itens para adicionar: novos OU duplicatas com resolution='add' OU duplicatas com resolution='replace'
    const transactionsToAdd = importedData
      .filter((t, index) => 
        !excludedIndexes.has(index) && 
        t.isValid && 
        (t.resolution === 'add' || t.resolution === 'replace')
      )
      .map(t => {
        // Valores já estão em centavos e sempre positivos na validação
        const amount = Math.round(Math.abs(t.valor));
        
        // Se é transferência mas não tem conta destino, é a transação de entrada (income)
        let finalType = t.parsedType as 'income' | 'expense' | 'transfer';
        if (finalType === 'transfer' && !t.toAccountId) {
          finalType = 'income';
        }
        
        return {
          description: t.descricao.trim(),        
          // Edge function + função SQL definem o sinal com base no tipo
          // Portanto, SEMPRE enviamos amount positivo para passar na validação Zod
          amount,
          category: t.categoria.trim(),
          type: finalType,
          account_id: t.accountId as string,
          to_account_id: t.toAccountId,
          date: t.parsedDate?.toISOString().split('T')[0] as string,
          status: t.parsedStatus as 'completed' | 'pending',
          installments: t.parcelas && t.parcelas.trim() && t.parcelas.includes('/') ? 
            parseInt(t.parcelas.split('/')[1], 10) || undefined : undefined,
          current_installment: t.parcelas && t.parcelas.trim() && t.parcelas.includes('/') ? 
            parseInt(t.parcelas.split('/')[0], 10) || undefined : undefined,
          invoice_month: t.invoiceMonth && t.invoiceMonth.trim() ? t.invoiceMonth.trim() : undefined,
          is_fixed: undefined, // Transações importadas não são fixas
          is_provision: undefined // Transações importadas não são provisão
        };
      });

    const transactionsToReplaceIds = importedData
      .filter((t, index) => {
        const shouldInclude = !excludedIndexes.has(index) && 
          t.isValid && 
          t.isDuplicate && 
          t.resolution === 'replace' && 
          t.existingTransactionId;
        
        if (shouldInclude) {
          logger.debug('[ImportTransactions] Item marcado para substituição:', {
            index,
            descricao: t.descricao,
            existingTransactionId: t.existingTransactionId,
            resolution: t.resolution,
            isDuplicate: t.isDuplicate
          });
        }
        
        return shouldInclude;
      })
      .map(t => t.existingTransactionId!);

    // Log detalhado com mês da fatura
    const transactionsWithInvoiceMonth = transactionsToAdd.filter(t => t.invoice_month);
    logger.debug('[ImportTransactions] Processando importação:', {
      total: importedData.length,
      transactionsToAdd: transactionsToAdd.length,
      transactionsWithInvoiceMonth: transactionsWithInvoiceMonth.length,
      invoiceMonthSamples: transactionsWithInvoiceMonth.slice(0, 3).map(t => ({
        description: t.description,
        invoice_month: t.invoice_month
      })),
      transactionsToReplaceIds: transactionsToReplaceIds.length,
      transactionsToReplaceDetails: transactionsToReplaceIds,
      excluded: excludedIndexes.size
    });

    if (transactionsToAdd.length === 0 && transactionsToReplaceIds.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum item válido para importar',
        variant: "destructive",
      });
      return;
    }

    onImportTransactions(transactionsToAdd, transactionsToReplaceIds);
    
    toast({
      title: 'Sucesso',
      description: `${transactionsToAdd.length} transação(ões) importada(s) com sucesso`,
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
    
    const checkingAccount = accounts.find(acc => acc.type === 'checking')?.name || 'Conta Corrente';
    const savingsAccount = accounts.find(acc => acc.type === 'savings')?.name || 'Poupança';
    const creditAccount = accounts.find(acc => acc.type === 'credit')?.name || 'Cartão de Crédito';
    
    const templateData = [
      {
        'Data': '15/03/2024',
        'Descrição': 'Salário',
        'Categoria': 'Salário',
        'Tipo': 'Receita',
        'Conta': checkingAccount,
        'Conta Destino': '',
        'Valor': 5000.00,
        'Status': 'Concluída',
        'Parcelas': '',
        'Mês Fatura': ''
      },
      {
        'Data': '16/03/2024',
        'Descrição': 'Supermercado',
        'Categoria': 'Alimentação',
        'Tipo': 'Despesa',
        'Conta': checkingAccount,
        'Conta Destino': '',
        'Valor': 150.50,
        'Status': 'Concluída',
        'Parcelas': '',
        'Mês Fatura': ''
      },
      {
        'Data': '17/03/2024',
        'Descrição': 'Transferência para Poupança',
        'Categoria': 'Transferência',
        'Tipo': 'Transferência',
        'Conta': checkingAccount,
        'Conta Destino': savingsAccount,
        'Valor': 1000.00,
        'Status': 'Concluída',
        'Parcelas': '',
        'Mês Fatura': ''
      },
      {
        'Data': '18/03/2024',
        'Descrição': 'Notebook - Parcela 1',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': creditAccount,
        'Conta Destino': '',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '1/3',
        'Mês Fatura': '2024-03'
      },
      {
        'Data': '18/03/2024',
        'Descrição': 'Notebook - Parcela 2',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': creditAccount,
        'Conta Destino': '',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '2/3',
        'Mês Fatura': '2024-04'
      },
      {
        'Data': '18/03/2024',
        'Descrição': 'Notebook - Parcela 3',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': creditAccount,
        'Conta Destino': '',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '3/3',
        'Mês Fatura': '2024-05'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    // Configurar largura das colunas
    const colWidths = [
      { wch: 12 },  // Data
      { wch: 30 },  // Descrição
      { wch: 20 },  // Categoria
      { wch: 15 },  // Tipo
      { wch: 25 },  // Conta
      { wch: 25 },  // Conta Destino
      { wch: 15 },  // Valor
      { wch: 12 },  // Status
      { wch: 12 },  // Parcelas
      { wch: 12 }   // Mês Fatura
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'modelo-importacao-transacoes.xlsx');

    toast({
      title: 'Sucesso',
      description: 'Modelo de exemplo baixado com sucesso',
    });
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Transações
          </DialogTitle>
          <DialogDescription>
            Importe transações em lote a partir de um arquivo Excel
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
                        <li><strong>Data:</strong> dd/MM/yyyy (ex: 15/03/2024)</li>
                        <li><strong>Descrição:</strong> Descrição da transação</li>
                        <li><strong>Categoria:</strong> Categoria da transação</li>
                        <li><strong>Tipo:</strong> Receita, Despesa ou Transferência</li>
                        <li><strong>Conta:</strong> Nome da conta (deve existir no sistema)</li>
                        <li><strong>Valor:</strong> Valor numérico positivo</li>
                        <li><strong>Status:</strong> Concluída ou Pendente (opcional)</li>
                        <li><strong>Parcelas:</strong> Formato 1/3 (opcional)</li>
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
                    Duplicatas Encontradas: {summary.duplicates} transações
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
                <CardTitle>Prévia das Transações ({importedData.length} total)</CardTitle>
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
                            <span className="text-muted-foreground">Data:</span>
                            <span className="ml-1 font-medium">
                              {transaction.parsedDate 
                                ? transaction.parsedDate.toLocaleDateString('pt-BR')
                                : transaction.data}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="ml-1 font-medium">R$ {(transaction.valor / 100).toFixed(2)}</span>
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t">
                          {transaction.categoria && (
                            <div>
                              <span className="text-muted-foreground">Categoria:</span>
                              <span className="ml-1 truncate" title={transaction.categoria}>{transaction.categoria}</span>
                            </div>
                          )}
                          {transaction.status && (
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <span className="ml-1 capitalize">{transaction.status}</span>
                            </div>
                          )}
                          {transaction.parcelas && (
                            <div>
                              <span className="text-muted-foreground">Parcela:</span>
                              <span className="ml-1">{transaction.parcelas}</span>
                            </div>
                          )}
                          {transaction.invoiceMonth && (
                            <div>
                              <span className="text-muted-foreground">Mês Fatura:</span>
                              <span className="ml-1">{transaction.invoiceMonth}</span>
                            </div>
                          )}
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

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport}
            disabled={transactionsToImportCount === 0 || isProcessing}
          >
            Importar {transactionsToImportCount} transação{transactionsToImportCount !== 1 ? 'ões' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}