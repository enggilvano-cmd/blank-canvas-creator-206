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
  actionType?: "bill_payment" | "budget_exceeded" | "account_low";
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
  const todayStr = getTodayInUserTimezone();
  const today = new Date(todayStr);
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
      if (billAmounts && billAmounts[account.id] !== undefined) {
        amount = billAmounts[account.id];
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
      // 1. It's within the reminder period
      // 2. There is an amount to pay (amount > 0)
      if (daysUntilDue <= reminderDays && daysUntilDue >= 0 && amount > 0) {
        reminders.push({
          id: `due_${account.id}_${dueDate.getTime()}`,
          title: "Vencimento de Fatura",
          message: `A fatura do ${account.name} vence em ${daysUntilDue} dia(s). Valor: ${formatCurrency(amount)}`,
          type: "reminder",
          date: today,
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
  const todayStr = getTodayInUserTimezone();
  const today = new Date(todayStr);
  
  accounts
    .filter(acc => acc.type === "credit" && acc.due_date)
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
      
      // Determine the amount
      let amount = 0;
      if (billAmounts && billAmounts[account.id] !== undefined) {
        amount = billAmounts[account.id];
      } else {
        // Fallback: use balance if negative (debt)
        if (account.balance < 0) {
          amount = Math.abs(account.balance);
        }
      }
      
      // Only alert if there's an amount to pay
      if (amount > 0) {
        alerts.push({
          id: `overdue_${account.id}_${dueDate.getTime()}`,
          title: "Fatura Vencida",
          message: `A fatura do ${account.name} está vencida há ${daysOverdue} dia(s). Valor: ${formatCurrency(amount)}`,
          type: "alert",
          date: today,
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
        message: `A conta ${account.name} está com saldo baixo: R$ ${account.balance.toFixed(2)}`,
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