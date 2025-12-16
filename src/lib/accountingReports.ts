import { loadJsPDF } from "./lazyImports";
import type jsPDF from 'jspdf';
import { format } from "date-fns";
import { formatCurrency } from "./formatters";
import type { JournalEntry, ChartOfAccount } from "@/types/accounting";

// Types for PDF export
interface TranslationFunction {
  (key: string): string;
}

// Interfaces
export interface DREReport {
  totalRevenue: number;
  totalExpenses: number;
  netResult: number;
  revenueByCategory: Array<{ category: string; amount: number }>;
  expensesByCategory: Array<{ category: string; amount: number }>;
}

export interface BalanceSheetReport {
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  currentAssets: Array<{ account: string; balance: number }>;
  investments: Array<{ account: string; balance: number }>;
  currentLiabilities: Array<{ account: string; balance: number }>;
  totalCurrentAssets: number;
  totalInvestments: number;
  totalCurrentLiabilities: number;
}

export interface CashFlowReport {
  openingBalance: number;
  inflows: number;
  outflows: number;
  operatingActivities: number;
  investmentActivities: number;
  netCashFlow: number;
  closingBalance: number;
}

// Gerar DRE (Demonstração do Resultado do Exercício)
// ATUALIZADO: Agora usa journal_entries ao invés de transactions
export function generateDRE(
  journalEntries: JournalEntry[],
  chartOfAccounts: ChartOfAccount[],
  _startDate: Date,
  _endDate: Date
): DREReport {
  // Receitas (contas de revenue com crédito)
  const revenueAccounts = chartOfAccounts.filter(acc => acc.category === 'revenue');
  const revenueByCategory = revenueAccounts.map(account => {
    const accountEntries = journalEntries.filter(
      je => je.account_id === account.id && je.entry_type === 'credit'
    );
    const amount = accountEntries.reduce((sum, je) => sum + je.amount, 0);
    return {
      category: `${account.code} - ${account.name}`,
      amount
    };
  }).filter(item => item.amount > 0);

  const totalRevenue = revenueByCategory.reduce((sum, item) => sum + item.amount, 0);

  // Despesas (contas de expense com débito)
  const expenseAccounts = chartOfAccounts.filter(acc => acc.category === 'expense');
  const expensesByCategory = expenseAccounts.map(account => {
    const accountEntries = journalEntries.filter(
      je => je.account_id === account.id && je.entry_type === 'debit'
    );
    const amount = accountEntries.reduce((sum, je) => sum + je.amount, 0);
    return {
      category: `${account.code} - ${account.name}`,
      amount: amount // Despesas como valores positivos (débitos)
    };
  }).filter(item => item.amount > 0);

  const totalExpenses = expensesByCategory.reduce((sum, item) => sum + item.amount, 0);

  // Resultado Líquido (Receitas - Despesas)
  const netResult = totalRevenue - totalExpenses;

  return {
    totalRevenue,
    totalExpenses,
    netResult,
    revenueByCategory,
    expensesByCategory,
  };
}

// Gerar Balanço Patrimonial
// ATUALIZADO: Agora usa chart_of_accounts e journal_entries
export function generateBalanceSheet(
  journalEntries: JournalEntry[],
  chartOfAccounts: ChartOfAccount[],
  _referenceDate: Date
): BalanceSheetReport {
  // Calcular saldo de cada conta contábil
  const accountBalances = new Map<string, number>();
  
  chartOfAccounts.forEach(account => {
    const entries = journalEntries.filter(je => je.account_id === account.id);
    
    let balance = 0;
    entries.forEach(entry => {
      if (account.nature === 'debit') {
        // Contas de natureza devedora: débito aumenta, crédito diminui
        balance += entry.entry_type === 'debit' ? entry.amount : -entry.amount;
      } else {
        // Contas de natureza credora: crédito aumenta, débito diminui
        balance += entry.entry_type === 'credit' ? entry.amount : -entry.amount;
      }
    });
    
    if (balance !== 0) {
      accountBalances.set(account.id, balance);
    }
  });

  // Ativo Circulante (contas de asset)
  const assetAccounts = chartOfAccounts.filter(acc => acc.category === 'asset');
  const currentAssets = assetAccounts.map(account => ({
    account: `${account.code} - ${account.name}`,
    balance: accountBalances.get(account.id) || 0
  })).filter(item => item.balance > 0);

  const totalCurrentAssets = currentAssets.reduce((sum, item) => sum + item.balance, 0);

  // Investimentos (subcategoria de ativos, se existir)
  const investments = assetAccounts
    .filter(acc => acc.name.toLowerCase().includes('investimento') || acc.code.startsWith('1.02'))
    .map(account => ({
      account: `${account.code} - ${account.name}`,
      balance: accountBalances.get(account.id) || 0
    }))
    .filter(item => item.balance > 0);

  const totalInvestments = investments.reduce((sum, item) => sum + item.balance, 0);

  // Passivo Circulante (contas de liability)
  const liabilityAccounts = chartOfAccounts.filter(acc => acc.category === 'liability');
  const currentLiabilities = liabilityAccounts.map(account => ({
    account: `${account.code} - ${account.name}`,
    balance: accountBalances.get(account.id) || 0
  })).filter(item => item.balance > 0);

  const totalCurrentLiabilities = currentLiabilities.reduce((sum, item) => sum + item.balance, 0);

  // Total de Ativos e Passivos
  const totalAssets = totalCurrentAssets + totalInvestments;
  const totalLiabilities = totalCurrentLiabilities;

  // Patrimônio Líquido = Ativos - Passivos
  // CORREÇÃO: Aplicar a equação contábil fundamental (ATIVO = PASSIVO + PL)
  // Portanto: PL = ATIVO - PASSIVO
  const equity = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    equity,
    currentAssets,
    investments,
    currentLiabilities,
    totalCurrentAssets,
    totalInvestments,
    totalCurrentLiabilities,
  };
}

// Gerar Fluxo de Caixa
// ATUALIZADO: Agora usa journal_entries e chart_of_accounts
export function generateCashFlow(
  journalEntries: JournalEntry[],
  chartOfAccounts: ChartOfAccount[],
  startDate: Date,
  endDate: Date
): CashFlowReport {
  // Identificar contas de caixa/banco (ativos circulantes líquidos)
  const cashAccounts = chartOfAccounts.filter(
    (acc) => 
      acc.category === 'asset' && 
      (acc.code.startsWith('1.01.01') || // Caixa
       acc.code.startsWith('1.01.02') || // Banco Corrente
       acc.code.startsWith('1.01.03'))   // Banco Poupança
  );

  const cashAccountIds = cashAccounts.map(acc => acc.id);

  // Filtrar journal entries de contas de caixa
  const cashEntries = journalEntries.filter(je => 
    cashAccountIds.includes(je.account_id)
  );

  // Calcular saldo inicial (até a data inicial)
  const entriesUntilStart = cashEntries.filter((je) => {
    const date = new Date(je.entry_date);
    return date < startDate;
  });

  let openingBalance = 0;
  entriesUntilStart.forEach(entry => {
    const account = cashAccounts.find(acc => acc.id === entry.account_id);
    if (account) {
      if (account.nature === 'debit') {
        // Conta devedora: débito aumenta, crédito diminui
        openingBalance += entry.entry_type === 'debit' ? entry.amount : -entry.amount;
      } else {
        // Conta credora: crédito aumenta, débito diminui
        openingBalance += entry.entry_type === 'credit' ? entry.amount : -entry.amount;
      }
    }
  });

  // Filtrar entries do período
  const periodEntries = cashEntries.filter((je) => {
    const date = new Date(je.entry_date);
    return date >= startDate && date <= endDate;
  });

  // Calcular entradas (débitos nas contas de caixa/banco)
  const inflows = periodEntries
    .filter(je => je.entry_type === 'debit')
    .reduce((sum, je) => sum + je.amount, 0);

  // Calcular saídas (créditos nas contas de caixa/banco)
  const outflows = periodEntries
    .filter(je => je.entry_type === 'credit')
    .reduce((sum, je) => sum + je.amount, 0);

  // Atividades Operacionais (entradas - saídas)
  const operatingActivities = inflows - outflows;

  // Atividades de Investimento
  // Buscar contas de investimento
  const investmentAccounts = chartOfAccounts.filter(
    (acc) => acc.category === 'asset' && acc.code.startsWith('1.01.04')
  );

  const investmentAccountIds = investmentAccounts.map(acc => acc.id);

  const investmentEntries = journalEntries.filter((je) => {
    const date = new Date(je.entry_date);
    return date >= startDate && date <= endDate && investmentAccountIds.includes(je.account_id);
  });

  // Investimentos: débitos em contas de investimento = aplicação (saída)
  //                créditos em contas de investimento = resgate (entrada)
  const investmentActivities = investmentEntries.reduce((sum, je) => {
    if (je.entry_type === 'debit') {
      return sum - je.amount; // Aplicação é saída de caixa
    } else {
      return sum + je.amount; // Resgate é entrada de caixa
    }
  }, 0);

  // Fluxo de Caixa Líquido
  const netCashFlow = operatingActivities + investmentActivities;

  // Saldo Final
  const closingBalance = openingBalance + netCashFlow;

  return {
    openingBalance,
    inflows,
    outflows,
    operatingActivities,
    investmentActivities,
    netCashFlow,
    closingBalance,
  };
}

// Types for PDF export
interface TranslationFunction {
  (key: string): string;
}

// Exportar relatório para PDF
export async function exportReportToPDF(
  reportType: "dre" | "balance" | "cashflow",
  reportData: DREReport | BalanceSheetReport | CashFlowReport,
  startDate: Date,
  endDate: Date,
  t: TranslationFunction
) {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Título
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const title = {
    dre: t("reports.dre"),
    balance: t("reports.balanceSheet"),
    cashflow: t("reports.cashFlow"),
  }[reportType];
  doc.text(title, pageWidth / 2, yPos, { align: "center" });

  yPos += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const period =
    reportType === "balance"
      ? `${t("reports.positionAt")} ${format(endDate, "dd/MM/yyyy")}`
      : `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
  doc.text(period, pageWidth / 2, yPos, { align: "center" });

  yPos += 15;

  // Conteúdo específico de cada relatório
  if (reportType === "dre") {
    exportDREtoPDF(doc, reportData as DREReport, yPos, t);
  } else if (reportType === "balance") {
    exportBalanceSheetToPDF(doc, reportData as BalanceSheetReport, yPos, t);
  } else if (reportType === "cashflow") {
    exportCashFlowToPDF(doc, reportData as CashFlowReport, yPos, t);
  }

  // Salvar
  const filename = `${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}

function exportDREtoPDF(doc: jsPDF, data: DREReport, startY: number, t: TranslationFunction) {
  let y = startY;

  // Receitas
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.revenue"), 20, y);
  doc.text(formatCurrency(data.totalRevenue), 170, y, { align: "right" });
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  data.revenueByCategory.forEach((item) => {
    doc.text(`  ${item.category}`, 25, y);
    doc.text(formatCurrency(item.amount * 100), 170, y, { align: "right" });
    y += 5;
  });

  y += 5;

  // Despesas
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.expenses"), 20, y);
  doc.text(formatCurrency(data.totalExpenses), 170, y, { align: "right" });
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  data.expensesByCategory.forEach((item) => {
    doc.text(`  ${item.category}`, 25, y);
    doc.text(formatCurrency(item.amount * 100), 170, y, { align: "right" });
    y += 5;
  });

  y += 10;

  // Resultado Líquido
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.netResult"), 20, y);
  doc.text(formatCurrency(data.netResult), 170, y, { align: "right" });
}

function exportBalanceSheetToPDF(doc: jsPDF, data: BalanceSheetReport, startY: number, t: TranslationFunction) {
  let y = startY;

  // Ativo
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.assets"), 20, y);
  doc.text(formatCurrency(data.totalAssets), 90, y, { align: "right" });
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.currentAssets"), 25, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  data.currentAssets.forEach((item) => {
    doc.text(`  ${item.account}`, 30, y);
    doc.text(formatCurrency(item.balance * 100), 90, y, { align: "right" });
    y += 5;
  });

  if (data.investments.length > 0) {
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.text(t("reports.investments"), 25, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    data.investments.forEach((item) => {
      doc.text(`  ${item.account}`, 30, y);
      doc.text(formatCurrency(item.balance * 100), 90, y, { align: "right" });
      y += 5;
    });
  }

  y += 5;

  // Passivo
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.liabilities"), 110, startY);
  doc.text(formatCurrency(Math.abs(data.totalLiabilities)), 180, startY, { align: "right" });

  let yPassive = startY + 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.currentLiabilities"), 115, yPassive);
  yPassive += 5;

  doc.setFont("helvetica", "normal");
  data.currentLiabilities.forEach((item) => {
    doc.text(`  ${item.account}`, 120, yPassive);
    doc.text(formatCurrency(Math.abs(item.balance)), 180, yPassive, { align: "right" });
    yPassive += 5;
  });

  const maxY = Math.max(y, yPassive) + 10;

  // Patrimônio Líquido
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.equity"), 20, maxY);
  doc.text(formatCurrency(data.equity), 180, maxY, { align: "right" });
}

function exportCashFlowToPDF(doc: jsPDF, data: CashFlowReport, startY: number, t: TranslationFunction) {
  let y = startY;

  // Saldo Inicial
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.openingBalance"), 20, y);
  doc.text(formatCurrency(data.openingBalance), 170, y, { align: "right" });
  y += 10;

  // Atividades Operacionais
  doc.setFontSize(12);
  doc.text(t("reports.operatingActivities"), 20, y);
  doc.text(formatCurrency(data.operatingActivities), 170, y, { align: "right" });
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`  ${t("reports.cashInflows")}`, 25, y);
  doc.text(formatCurrency(data.inflows), 170, y, { align: "right" });
  y += 5;

  doc.text(`  ${t("reports.cashOutflows")}`, 25, y);
  doc.text(formatCurrency(Math.abs(data.outflows)), 170, y, { align: "right" });
  y += 8;

  // Atividades de Investimento
  if (data.investmentActivities !== 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("reports.investmentActivities"), 20, y);
    doc.text(formatCurrency(data.investmentActivities), 170, y, { align: "right" });
    y += 10;
  }

  y += 5;

  // Fluxo de Caixa Líquido
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(t("reports.netCashFlow"), 20, y);
  doc.text(formatCurrency(data.netCashFlow), 170, y, { align: "right" });
  y += 10;

  // Saldo Final
  doc.setFontSize(14);
  doc.text(t("reports.closingBalance"), 20, y);
  doc.text(formatCurrency(data.closingBalance), 170, y, { align: "right" });
}
