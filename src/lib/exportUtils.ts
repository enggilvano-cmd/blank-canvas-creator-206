import { loadXLSX } from './lazyImports';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ExportAccount, ExportCategory, ExportTransaction } from '@/types/export';

/**
 * Formata números para padrão brasileiro (vírgula como decimal, ponto como milhar)
 * Valores são assumidos estar em centavos
 */
function formatBRNumber(valueInCents: number): string {
  const valueInReais = valueInCents / 100;
  return valueInReais.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Exporta contas para Excel
 */
export async function exportAccountsToExcel(accounts: ExportAccount[]) {
  const XLSX = await loadXLSX();
  
  const exportData = accounts.map(account => ({
    'Nome': account.name,
    'Tipo': getAccountTypeLabel(account.type),
    'Saldo': formatBRNumber(account.balance),
    'Limite': account.limit_amount !== undefined && account.limit_amount !== null ? formatBRNumber(account.limit_amount) : '',
    'Fechamento': account.closing_date || '',
    'Vencimento': account.due_date || '',
    'Cor': account.color
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contas');

  // Configurar largura das colunas
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

  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  XLSX.writeFile(wb, `contas_${timestamp}.xlsx`);
}

/**
 * Exporta categorias para Excel
 */
export async function exportCategoriesToExcel(categories: ExportCategory[]) {
  const XLSX = await loadXLSX();
  
  const exportData = categories.map(category => ({
    'Nome': category.name,
    'Tipo': getCategoryTypeLabel(category.type),
    'Cor': category.color
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Categorias');

  // Configurar largura das colunas
  const colWidths = [
    { wch: 30 }, // Nome
    { wch: 15 }, // Tipo
    { wch: 12 }, // Cor
  ];
  ws['!cols'] = colWidths;

  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  XLSX.writeFile(wb, `categorias_${timestamp}.xlsx`);
}

/**
 * Exporta transações para Excel
 */
export async function exportTransactionsToExcel(
  transactions: ExportTransaction[],
  accounts: ExportAccount[],
  categories: ExportCategory[]
) {
  const XLSX = await loadXLSX();
  
  const exportData = transactions.map(transaction => {
    const account = accounts.find(a => a.id === transaction.account_id);
    const category = categories.find(c => c.id === transaction.category_id);
    const toAccount = transaction.to_account_id ? accounts.find(a => a.id === transaction.to_account_id) : null;
    
    // Identificar se é transferência (saída com to_account_id OU entrada com linked_transaction_id)
    const isTransfer = transaction.type === 'transfer' || transaction.to_account_id;

    return {
      'Data': format(new Date(transaction.date), 'dd/MM/yyyy', { locale: ptBR }),
      'Descrição': transaction.description,
      'Categoria': isTransfer ? 'Transferência' : (category?.name || '-'),
      'Tipo': isTransfer ? 'Transferência' : getTransactionTypeLabel(transaction.type),
      'Conta': account?.name || 'Desconhecida',
      'Conta Destino': toAccount?.name || '',
      'Valor': formatBRNumber(Math.abs(transaction.amount)),
      'Status': transaction.status === 'completed' ? 'Concluída' : 'Pendente',
      'Parcelas': transaction.installments 
        ? `${transaction.current_installment}/${transaction.installments}`
        : '',
      'Mês Fatura': transaction.invoice_month || ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transações');

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

  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  XLSX.writeFile(wb, `transacoes_${timestamp}.xlsx`);
}

/**
 * Exporta todos os dados para Excel (backup completo)
 */
export async function exportAllDataToExcel(
  accounts: ExportAccount[],
  categories: ExportCategory[],
  transactions: ExportTransaction[]
) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  // Sheet de Contas
  const accountsData = accounts.map(account => ({
    'Nome': account.name,
    'Tipo': getAccountTypeLabel(account.type),
    'Saldo': formatBRNumber(account.balance),
    'Limite': account.limit_amount !== undefined && account.limit_amount !== null ? formatBRNumber(account.limit_amount) : '',
    'Fechamento': account.closing_date || '',
    'Vencimento': account.due_date || '',
    'Cor': account.color
  }));
  const wsAccounts = XLSX.utils.json_to_sheet(accountsData);
  wsAccounts['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAccounts, 'Contas');

  // Sheet de Categorias
  const categoriesData = categories.map(category => ({
    'Nome': category.name,
    'Tipo': getCategoryTypeLabel(category.type),
    'Cor': category.color,
    'Criado em': category.created_at ? format(new Date(category.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : ''
  }));
  const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
  wsCategories['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorias');

  // Sheet de Transações
  const transactionsData = transactions.map(transaction => {
    const account = accounts.find(a => a.id === transaction.account_id);
    const category = categories.find(c => c.id === transaction.category_id);
    const toAccount = transaction.to_account_id ? accounts.find(a => a.id === transaction.to_account_id) : null;
    
    // Identificar se é transferência (saída com to_account_id OU entrada com linked_transaction_id)
    const isTransfer = transaction.type === 'transfer' || transaction.to_account_id;

    return {
      'Data': format(new Date(transaction.date), 'dd/MM/yyyy', { locale: ptBR }),
      'Descrição': transaction.description,
      'Categoria': isTransfer ? 'Transferência' : (category?.name || '-'),
      'Tipo': isTransfer ? 'Transferência' : getTransactionTypeLabel(transaction.type),
      'Conta': account?.name || 'Desconhecida',
      'Conta Destino': toAccount?.name || '',
      'Valor': formatBRNumber(Math.abs(transaction.amount)),
      'Status': transaction.status === 'completed' ? 'Concluída' : 'Pendente',
      'Parcelas': transaction.installments 
        ? `${transaction.current_installment}/${transaction.installments}`
        : '',
      'Mês Fatura': transaction.invoice_month || ''
    };
  });
  const wsTransactions = XLSX.utils.json_to_sheet(transactionsData);
  wsTransactions['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 15 },
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transações');

  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  XLSX.writeFile(wb, `backup_completo_${timestamp}.xlsx`);
}

// Funções auxiliares de formatação
function getAccountTypeLabel(type: string): string {
  switch (type) {
    case 'checking': return 'Conta Corrente';
    case 'savings': return 'Poupança';
    case 'credit': return 'Cartão de Crédito';
    case 'investment': return 'Investimento';
    case 'meal_voucher': return 'Vale Refeição/Alimentação';
    default: return type;
  }
}

function getCategoryTypeLabel(type: string): string {
  switch (type) {
    case 'income': return 'Receita';
    case 'expense': return 'Despesa';
    case 'both': return 'Ambos';
    default: return type;
  }
}

function getTransactionTypeLabel(type: string): string {
  switch (type) {
    case 'income': return 'Receita';
    case 'expense': return 'Despesa';
    case 'transfer': return 'Transferência';
    default: return type;
  }
}
