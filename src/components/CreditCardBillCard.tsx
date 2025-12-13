import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Account, Transaction } from "@/types";
import { CreditCard, RotateCcw, FileText, Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/context/SettingsContext";
import { logger } from "@/lib/logger";

// Helper para formatar moeda
const formatCentsHelper = (valueInCents: number, currency: string, language: string) => {
  return new Intl.NumberFormat(language === 'pt-BR' ? 'pt-BR' : language === 'es-ES' ? 'es-ES' : 'en-US', {
    style: "currency",
    currency: currency,
  }).format(valueInCents / 100);
};

interface CreditCardBillCardProps {
  account: Account;
  billDetails: {
    currentBillAmount: number;
    nextBillAmount: number;
    totalBalance: number; 
    availableLimit: number;
    paymentTransactions: Transaction[];
    currentInvoiceMonth?: string; // Mês da fatura no formato YYYY-MM
  };
  selectedMonth: Date; // <-- Prop ADICIONADA para o mês selecionado
  onPayBill: () => void;
  onReversePayment: () => void;
  onViewDetails: () => void;
}

export function CreditCardBillCard({ 
  account, 
  billDetails,
  selectedMonth,
  onPayBill, 
  onReversePayment,
  onViewDetails
}: CreditCardBillCardProps) {
  const { settings } = useSettings();
  
  logger.debug('CreditCardBillCard renderizando:', {
    account: account.name,
    balance: account.balance,
    currentBillAmount: billDetails.currentBillAmount,
    paymentsCount: billDetails.paymentTransactions?.length || 0
  });
  
  const formatCents = (valueInCents: number) => {
    return formatCentsHelper(valueInCents, settings.currency, settings.language);
  };
  
  if (!account || !billDetails) {
    return null
  }

  const { limit_amount = 0, closing_date, due_date } = account;
  const { 
    currentBillAmount, 
    nextBillAmount, 
    totalBalance, 
    availableLimit,
    paymentTransactions, // <-- Prop ADICIONADA
    currentInvoiceMonth // <-- Mês da fatura calculado
  } = billDetails;

  // Calcula o percentual de limite usado
  const limitUsedPercentage = (limit_amount ?? 0) > 0 ? (totalBalance / (limit_amount ?? 1)) * 100 : 0;
  
  // ✅ LÓGICA CORRIGIDA: Cálculo de fechamento e vencimento
  // O currentInvoiceMonth representa o mês de VENCIMENTO da fatura
  // Exemplo: currentInvoiceMonth = "2026-02" significa que a fatura VENCE em fevereiro
  const invoiceMonth = currentInvoiceMonth || format(selectedMonth, 'yyyy-MM');
  const [invoiceYear, invoiceMonthNum] = invoiceMonth.split('-').map(Number);
  
  const closingDay = closing_date || 1;
  const dueDay = due_date || 1;
  
  // 1. Data de VENCIMENTO: Sempre no mês indicado por currentInvoiceMonth
  const dueDateOfBill = new Date(invoiceYear, invoiceMonthNum - 1, dueDay);
  
  // 2. Data de FECHAMENTO: Calculada retroativamente a partir do vencimento
  // Regra: O fechamento é sempre ANTES do vencimento
  // - Se dueDay > closingDay: fecha no MESMO mês (ex: fecha dia 7, vence dia 15)
  // - Se dueDay <= closingDay: fecha no MÊS ANTERIOR (ex: fecha dia 25, vence dia 10 do próximo)
  let closingDateOfBill: Date;
  if (dueDay > closingDay) {
    // Fecha no mesmo mês do vencimento
    closingDateOfBill = new Date(invoiceYear, invoiceMonthNum - 1, closingDay);
  } else {
    // Fecha no mês anterior ao vencimento
    closingDateOfBill = new Date(invoiceYear, invoiceMonthNum - 2, closingDay);
  }
  
  const isClosed = isPast(closingDateOfBill);
  
  // --- LÓGICA DE PAGO ATUALIZADA ---
  const paidAmount = (paymentTransactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0)) || 0;
  const amountDue = Math.max(0, currentBillAmount);
  
  // Uma fatura está "Paga" se:
  // 1. Não há valor a pagar (amountDue <= 0, ou seja, crédito ou zero)
  // 2. OU está fechada E o valor pago >= valor devido
  const isPaid = amountDue <= 0 || (isClosed && paidAmount >= amountDue);
  
  // Botão de estorno aparece sempre que há pagamentos registrados
  const canReverse = paymentTransactions && paymentTransactions.length > 0;
  
  // Detectar fatura vencida não paga
  const isOverdue = isPast(dueDateOfBill) && !isPaid && amountDue > 0;
  
  logger.debug("[CreditCardBillCard] Status", {
    account: account.name,
    invoiceMonth,
    invoiceYear,
    invoiceMonthNum,
    closingDay,
    dueDay,
    selectedMonth: selectedMonth.toISOString().split('T')[0],
    closingDateOfBill: closingDateOfBill.toISOString().split('T')[0],
    dueDateOfBill: dueDateOfBill.toISOString().split('T')[0],
    isClosed,
    currentBillAmount,
    paidAmount,
    amountDue,
    isPaid,
    isOverdue,
    paymentTransactionsCount: paymentTransactions?.length || 0,
    canReverse,
    paymentTransactions: paymentTransactions?.map(t => ({ id: t.id, amount: t.amount, date: t.date }))
  });
  // --- FIM DA LÓGICA ---

  const billAmountColor = currentBillAmount > 0 
    ? "balance-negative" 
    : currentBillAmount < 0 
    ? "balance-negative" 
    : "text-muted-foreground";
  
  // Removida a duplicidade - vencimento já é exibido na seção de detalhes
  const billLabel = "Fatura Atual";

  // Verifica se o mês da fatura é diferente do mês de navegação
  const navigatedMonth = format(selectedMonth, 'yyyy-MM');
  const isDifferentMonth = currentInvoiceMonth && currentInvoiceMonth !== navigatedMonth;

  return (
    <Card className={cn(
      "financial-card flex flex-col shadow-md hover:shadow-lg transition-shadow",
      isOverdue && "border-2 border-destructive bg-destructive/5"
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: account.color || "#6b7280" }}
          >
            <CreditCard className="h-4 w-4" />
          </div>
          <span className="truncate" title={account.name}>{account.name}</span>
        </CardTitle>
        <div className="flex gap-2 flex-shrink-0">
          <Badge variant={isClosed ? 'secondary' : 'outline'}>
            {isClosed ? "Fechada" : "Aberta"}
          </Badge>
          {/* Badge de Pago/Pendente/Vencida baseado no fechamento + pagamentos */}
          {isOverdue ? (
            <Badge variant="destructive" className="animate-pulse">
              VENCIDA
            </Badge>
          ) : (
            <Badge variant={isPaid ? 'default' : 'destructive'}>
              {isPaid ? "Paga" : "Pendente"}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 flex-1">
        {/* Alerta de fatura vencida */}
        {isOverdue && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive rounded-md text-sm">
            <Calendar className="h-4 w-4 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-destructive">Fatura vencida!</span>
              <span className="text-destructive"> Venceu em {format(dueDateOfBill, "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
          </div>
        )}
        
        {/* Alerta se o mês da fatura for diferente do navegado */}
        {isDifferentMonth && currentInvoiceMonth && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-xs">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">
              Fatura ref. {format(new Date(currentInvoiceMonth + '-01T00:00:00'), 'MMM/yyyy', { locale: ptBR })}
            </span>
          </div>
        )}
        
        {/* Saldo da Fatura Atual */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{billLabel}</p>
          <div className="flex items-center gap-2">
            <p className={cn("text-2xl font-bold", billAmountColor)}>
              {formatCents(currentBillAmount)}
            </p>
            {isOverdue && (
              <AlertTriangle className="h-6 w-6 text-destructive animate-pulse" />
            )}
          </div>
        </div>
        
        {/* Detalhes de Limite */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Usado</span>
            <span>{formatCents(totalBalance)} / {formatCents(limit_amount ?? 0)}</span>
          </div>
          <Progress value={limitUsedPercentage} className="h-2" />
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Próxima Fatura</span>
            <span className="font-medium text-muted-foreground">{formatCents(nextBillAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Disponível</span>
            <span className={cn("font-medium", availableLimit >= 0 ? "balance-positive" : "balance-negative")}>
              {formatCents(availableLimit)}
            </span>
          </div>
          <div className="flex justify-between text-xs border-t pt-2 mt-2">
            <span className="text-muted-foreground">Fechamento</span>
            <span className="font-medium">{format(closingDateOfBill, 'dd/MM/yyyy')}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Vencimento</span>
            <span className="font-medium">{format(dueDateOfBill, 'dd/MM/yyyy')}</span>
          </div>
        </div>
      </CardContent>
      
      {/* --- NOVO: Botões de Ação --- */}
      <CardFooter className="flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          {canReverse && (
            <Button 
              variant="outline" 
              className="flex-1" 
              onClick={onReversePayment}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Estornar
            </Button>
          )}
          
        <Button 
          type="button"
          className="flex-1" 
          onClick={onPayBill} 
        >
          Pagar Fatura
        </Button>
        </div>
        
        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={onViewDetails}
        >
          <FileText className="h-4 w-4 mr-2" />
          Ver Detalhes
        </Button>
      </CardFooter>
      {/* --- FIM DO NOVO --- */}
    </Card>
  );
}