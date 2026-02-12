// Notification utilities for reminders and alerts
import { logger } from '@/lib/logger';
import type { NotificationAccount } from '@/types/export';
import { getTodayInUserTimezone, toUserTimezone } from '@/lib/timezone';
import { formatCurrency } from '@/lib/formatters';

export interface NotificationSettings {
  billReminders: boolean;
  transactionAlerts: boolean;
  budgetAlerts: boolean;
  dueDateReminders: number; // days before due date
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "reminder" | "alert" | "info";
  date: Date;
  read: boolean;
  actionType?: "bill_payment" | "budget_exceeded" | "account_low" | "invoice_receipt";
  actionData?: Record<string, unknown>;
}

// Check if browser supports notifications
export function canShowNotifications(): boolean {
  return "Notification" in window;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!canShowNotifications()) return false;
  
  if (Notification.permission === "granted") {
    return true;
  }
  
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  
  return false;
}

// Show system notification
export function showSystemNotification(title: string, options?: NotificationOptions) {
  if (Notification.permission === "granted") {
    return new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options
    });
  }
}

// Get due date reminders for credit cards
export function getDueDateReminders(
  accounts: NotificationAccount[], 
  settings: NotificationSettings,
  billAmounts?: Record<string, number>
): Notification[] {
  const reminders: Notification[] = [];
  // ✅ BUG FIX #12: Use user timezone
  // Normalizar para meia-noite local para cálculos corretos de dias
  const todayStr = getTodayInUserTimezone();
  const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
  const today = new Date(tYear, tMonth - 1, tDay); // Meia-noite local
  
  // Data da notificação fixada às 09:00 da manhã para parecer "do dia"
  const notificationDate = new Date(tYear, tMonth - 1, tDay, 9, 0, 0);
  
  const reminderDays = settings.dueDateReminders;
  
  accounts
    .filter(acc => acc.type === "credit" && acc.due_date)
    .forEach(account => {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Calculate due date for current month
      const dueDate = new Date(currentYear, currentMonth, account.due_date!);
      
      // If due date has passed this month, calculate for next month
      if (dueDate < today) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determine the amount to show
      // If billAmounts is provided, use it. Otherwise fallback to balance (legacy behavior)
      // Note: billAmounts should contain the calculated invoice amount for the current month
      let amount = 0;
      // Se billAmounts foi passado, prioriza o valor calculado (que considera pagamentos recentes)
      // Se não houver valor (undefined), assume 0 para evitar fallback para saldo total (que inclui parcelas futuras)
      if (billAmounts) {
        amount = billAmounts[account.id] || 0;
      } else {
        // Fallback: use total balance if no specific bill amount is calculated
        // Only show if balance is negative (debt)
        if (account.balance < 0) {
          amount = Math.abs(account.balance);
        } else {
          // If balance is positive (credit) and no bill amount, skip or show 0
          amount = 0;
        }
      }

      // Only show notification if:
      // 1. It's the due date (0) or one day before (1)
      // 2. There is an amount to pay (amount > 0)
      if (daysUntilDue <= 1 && daysUntilDue >= 0 && amount > 0) {
        reminders.push({
          id: `due_${account.id}_${dueDate.getTime()}`,
          title: "Vencimento de Fatura",
          message: `A fatura do ${account.name} vence em ${daysUntilDue} dia(s). Valor: ${formatCurrency(Math.round(amount * 100))}`,

          type: "reminder",
          date: notificationDate,
          read: false,
          actionType: "bill_payment",
          actionData: { accountId: account.id }
        });
      }
    });
  
  return reminders;
}

// Get overdue bill alerts for credit cards
export function getOverdueBillAlerts(
  accounts: NotificationAccount[],
  billAmounts?: Record<string, number>
): Notification[] {
  const alerts: Notification[] = [];
  // Normalizar para meia-noite local
  const todayStr = getTodayInUserTimezone();
  const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
  const today = new Date(tYear, tMonth - 1, tDay); // Meia-noite local for calculations
  const notificationDate = new Date(tYear, tMonth - 1, tDay, 9, 0, 0); // 9 AM for display
  
  accounts
    .filter(acc => acc.type === "credit" && acc.due_date && acc.balance < 0)
    .forEach(account => {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Calculate due date for current month
      let dueDate = new Date(currentYear, currentMonth, account.due_date!);
      
      // If due date hasn't passed yet this month, check previous month
      if (dueDate >= today) {
        dueDate.setMonth(dueDate.getMonth() - 1);
      }
      
      // Calculate days overdue
      const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only show if actually overdue (positive days)
      if (daysOverdue <= 0) return;
      
      // Use balance (which must be negative to reach here)
      const amount = Math.abs(account.balance);
      
      // Alert if there's debt and the due date has passed
      if (amount > 0) {
        alerts.push({
          id: `overdue_${account.id}_${dueDate.getTime()}`,
          title: "Fatura Vencida",
          message: `A fatura do ${account.name} está vencida há ${daysOverdue} dia(s). Valor: ${formatCurrency(Math.round(amount * 100))}`,

          type: "alert",
          date: notificationDate,
          read: false,
          actionType: "bill_payment",
          actionData: { accountId: account.id, overdue: true }
        });
      }
    });
  
  return alerts;
}

// Get low balance alerts
export function getLowBalanceAlerts(accounts: NotificationAccount[], threshold: number = 100): Notification[] {
  const alerts: Notification[] = [];
  // ✅ BUG FIX #12: Use user timezone
  const dateStr = getTodayInUserTimezone(); // Stable for the day
  
  accounts
    .filter(acc => acc.type !== "credit" && acc.balance > 0 && acc.balance <= threshold)
    .forEach(account => {
      alerts.push({
        id: `low_balance_${account.id}_${dateStr}`,
        title: "Saldo Baixo",
        message: `A conta ${account.name} está com saldo baixo: ${formatCurrency(Math.round(account.balance * 100))}`,
        type: "alert",
        date: new Date(),
        read: false,
        actionType: "account_low",
        actionData: { accountId: account.id }
      });
    });
  
  return alerts;
}

// Format notification for display
export function formatNotificationTime(date: Date): string {
  // ✅ BUG FIX #12: Use user timezone for comparison
  const now = toUserTimezone(new Date());
  const notificationDate = toUserTimezone(date);
  const diffInMinutes = Math.floor((now.getTime() - notificationDate.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return "Agora";
  if (diffInMinutes < 60) return `${diffInMinutes}m atrás`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h atrás`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d atrás`;
  
  return date.toLocaleDateString('pt-BR');
}

// Schedule recurring notifications (would need a background service in production)
export function scheduleNotifications(accounts: NotificationAccount[], settings: NotificationSettings) {
  if (!settings.billReminders) return;
  
  const reminders = getDueDateReminders(accounts, settings);
  
  reminders.forEach(reminder => {
    // In a real app, you'd schedule these with a service worker
    // For demo purposes, we'll just log them
    logger.debug("Notification scheduled:", reminder.title, reminder.message);
  });
}

// Get all active notifications
export function getAllNotifications(accounts: NotificationAccount[], settings: NotificationSettings): Notification[] {
  const notifications: Notification[] = [];
  
  if (settings.billReminders) {
    notifications.push(...getDueDateReminders(accounts, settings));
    notifications.push(...getOverdueBillAlerts(accounts));
  }
  
  if (settings.transactionAlerts) {
    notifications.push(...getLowBalanceAlerts(accounts));
  }
  
  return notifications.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface NotificationTransaction {
  id: string;
  description: string;
  amount: number;
  date: Date;
  status: 'pending' | 'completed';
  type: 'income' | 'expense';
}

// Get pending transaction reminders (bills to pay and receivables)
export function getPendingTransactionReminders(
  transactions: NotificationTransaction[]
): Notification[] {
  const reminders: Notification[] = [];
  // Normalizar para meia-noite local
  const todayStr = getTodayInUserTimezone();
  const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
  const today = new Date(tYear, tMonth - 1, tDay); // Meia-noite local (calc)
  const notificationDate = new Date(tYear, tMonth - 1, tDay, 9, 0, 0); // 9 AM (display)

  transactions.forEach(transaction => {
    // Garantir que é pendente e despesa ou receita
    if (transaction.status !== 'pending') return;
    if (transaction.type !== 'expense' && transaction.type !== 'income') return;

    // Fix: Treat date object as container for UTC date components which represent the Calendar Date
    // This avoids timezone shifting (e.g. 2026-02-13 UTC -> 2026-02-12 Local)
    const txDateOriginal = new Date(transaction.date);
    
    // Construct local date at midnight using UTC components (Calendar Date)
    // Example: DB sends 2026-02-13T00:00Z. We want 2026-02-13 Local.
    // getUTCDay() gets 13. new Date(..., 13) creates 13th Local.
    const dueDate = new Date(
      txDateOriginal.getUTCFullYear(),
      txDateOriginal.getUTCMonth(),
      txDateOriginal.getUTCDate(),
      0, 0, 0, 0
    );
    
    // Normalizar para remover componente de horas no cálculo de dias
    const dueTime = dueDate.getTime();
    const todayTime = today.getTime();

    const daysUntilDue = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    // Regra: Notificar apenas no dia (0) ou um dia antes (1)
    if (daysUntilDue <= 1 && daysUntilDue >= 0) {
       const isExpense = transaction.type === 'expense';
       const title = isExpense ? "Conta a Pagar" : "Conta a Receber";
       const messagePrefix = isExpense ? "O pagamento" : "O recebimento";
       const dayText = daysUntilDue === 0 ? 'hoje' : 'amanhã';
       const dueText = isExpense ? `vence ${dayText}` : `está previsto para ${dayText}`;

       reminders.push({
          id: `pending_tx_${transaction.id}`,
          title: title,
          message: `${messagePrefix} "${transaction.description}" ${dueText}. Valor: ${formatCurrency(Math.round(transaction.amount * 100))}`,
          type: "reminder",
          date: notificationDate,
          read: false,
          actionType: isExpense ? "bill_payment" : "invoice_receipt", 
          actionData: { transactionId: transaction.id }
       });
    }
  });

  return reminders;
}