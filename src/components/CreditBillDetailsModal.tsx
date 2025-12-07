import { Account, Transaction, CreditBill } from '@/types'
import { formatCurrency } from '@/lib/formatters'
import { format, isPast } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { logger } from '@/lib/logger'

interface CreditBillDetailsModalProps {
  bill: (CreditBill & { account: Account } & { transactions: Transaction[] }) | null
  onClose: () => void
}

export function CreditBillDetailsModal({ bill, onClose }: CreditBillDetailsModalProps) {
  if (!bill) return null

  const paidAmount = bill.paid_amount
  const remainingAmount = bill.total_amount - paidAmount
  
  // Calcular se está fechada baseado no mês da fatura
  // billing_cycle pode estar em formato "MM/yyyy" ou "yyyy-MM"
  // O billing_cycle representa o mês de VENCIMENTO da fatura (convenção bancária)
  let billMonth = bill.billing_cycle;
  if (billMonth.includes('/')) {
    // Converter "11/2025" para "2025-11"
    const [m, y] = billMonth.split('/');
    billMonth = `${y}-${m.padStart(2, '0')}`;
  }
  
  const [year, month] = billMonth.split('-').map(Number);
  const closingDay = bill.account.closing_date || 1;
  const dueDay = bill.account.due_date || 1;
  
  // O mês da fatura (billing_cycle) é o mês de VENCIMENTO
  // Data de vencimento: sempre no mês da fatura (billing_cycle)
  const dueDateOfBill = new Date(year, month - 1, dueDay);
  
  // Data de fechamento: se dueDay <= closingDay, fecha no MÊS ANTERIOR ao vencimento
  // Exemplo: Vence dia 10/01, fecha dia 27 → fecha em 27/12 (mês anterior)
  let closingDateOfBill: Date;
  if (dueDay <= closingDay) {
    // Fecha no mês anterior ao vencimento
    closingDateOfBill = new Date(year, month - 2, closingDay); // month-2 porque month-1 já é o mês da fatura
  } else {
    // Fecha no mesmo mês do vencimento (caso raro onde vencimento é antes do fechamento)
    closingDateOfBill = new Date(year, month - 1, closingDay);
  }
  
  const isClosed = isPast(closingDateOfBill);
  
  const amountDue = Math.max(0, bill.total_amount)
  // Uma fatura está "Paga" se não há valor a pagar OU se está fechada e foi paga
  const isPaid = amountDue <= 0 || (isClosed && paidAmount >= amountDue);

  logger.debug("[CreditBillDetailsModal] Status", {
    billMonth,
    closingDateOfBill: format(closingDateOfBill, 'dd/MM/yyyy'),
    dueDateOfBill: format(dueDateOfBill, 'dd/MM/yyyy'),
    isClosed,
    totalAmount: bill.total_amount,
    paidAmount,
    amountDue,
    isPaid,
  });

  return (
    <Dialog open={!!bill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <div className="flex justify-between items-center">
              <span>
                {bill.account.name} - {format(new Date(bill.due_date), 'MMMM/yyyy', { locale: ptBR })}
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <Badge variant={isClosed ? 'secondary' : 'outline'}>
                  {isClosed ? 'Fechada' : 'Aberta'}
                </Badge>
                <Badge variant={isPaid ? 'default' : 'destructive'}>
                  {isPaid ? 'Paga' : 'Pendente'}
                </Badge>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Vencimento em {format(dueDateOfBill, 'dd/MM/yyyy', { locale: ptBR })} | Fechamento em {format(closingDateOfBill, 'dd/MM/yyyy', { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg border">
          <div>
            <div className="text-sm text-muted-foreground">Valor Total</div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(bill.total_amount)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-success">Pago: {formatCurrency(paidAmount)}</div>
            <div className="text-sm font-medium text-destructive">Restante: {formatCurrency(remainingAmount)}</div>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.transactions
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{format(new Date(transaction.date), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell className={`text-right ${transaction.type === 'income' ? 'text-success' : ''}`}>
                      {transaction.type === 'income' ? '-' : ''}{formatCurrency(Math.abs(transaction.amount))}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}