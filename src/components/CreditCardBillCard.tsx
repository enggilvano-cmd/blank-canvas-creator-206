import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Account, Transaction } from "@/types";
import { CreditCard, RotateCcw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast } from 'date-fns';
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
    paymentTransactions // <-- Prop ADICIONADA
  } = billDetails;

  // Calcula o percentual de limite usado
  const limitUsedPercentage = limit_amount > 0 ? (totalBalance / limit_amount) * 100 : 0;
  
  // Lógica de Status - calcula a data de fechamento e vencimento do mês da fatura
  // selectedMonth é o mês que o usuário está visualizando
  const closingDay = closing_date || 1;
  const dueDay = due_date || 1;
  
  // Data de fechamento: sempre no mês selecionado
  const closingDateOfBill = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), closingDay);
  
  // Data de vencimento: se dueDay <= closingDay, vence no MÊS SEGUINTE
  // Exemplo: Fecha dia 30, vence dia 7 → vence no mês seguinte
  let dueDateOfBill: Date;
  if (dueDay <= closingDay) {
    // Vence no mês seguinte ao fechamento
    dueDateOfBill = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, dueDay);
  } else {
    // Vence no mesmo mês do fechamento (caso raro)
    dueDateOfBill = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), dueDay);
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
  
  logger.debug("[CreditCardBillCard] Status", {
    account: account.name,
    selectedMonth: selectedMonth.toISOString().split('T')[0],
    closingDateOfBill: closingDateOfBill.toISOString().split('T')[0],
    dueDateOfBill: dueDateOfBill.toISOString().split('T')[0],
    isClosed,
    currentBillAmount,
    paidAmount,
    amountDue,
    isPaid,
  });
  // --- FIM DA LÓGICA ---

  const billAmountColor = currentBillAmount > 0 
    ? "balance-negative" 
    : currentBillAmount < 0 
    ? "balance-negative" 
    : "text-muted-foreground";
  
  const billLabel = currentBillAmount < 0 
    ? "Fatura Atual"
    : `Fatura Atual (Vence dia ${format(dueDateOfBill, 'dd/MM')})`;

  return (
    <Card className="financial-card flex flex-col shadow-md hover:shadow-lg transition-shadow">
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
          {/* Badge de Pago/Pendente baseado no fechamento + pagamentos */}
          <Badge variant={isPaid ? 'default' : 'destructive'}>
            {isPaid ? "Paga" : "Pendente"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 flex-1">
        {/* Saldo da Fatura Atual */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{billLabel}</p>
          <p className={cn("text-2xl font-bold", billAmountColor)}>
            {formatCents(currentBillAmount)}
          </p>
        </div>
        
        {/* Detalhes de Limite */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Usado</span>
            <span>{formatCents(totalBalance)} / {formatCents(limit_amount)}</span>
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