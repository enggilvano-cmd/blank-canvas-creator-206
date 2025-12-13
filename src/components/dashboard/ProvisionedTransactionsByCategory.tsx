import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import type { Transaction, Category } from '@/types';

interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalProvisioned: number;
  totalCompleted: number;
}

interface ProvisionedTransactionsByCategoryProps {
  transactions: Transaction[];
  fixedTransactions: Transaction[];
  categories: Category[];
  type: 'income' | 'expense';
  dateFrom?: string;
  dateTo?: string;
}

export function ProvisionedTransactionsByCategory({
  transactions,
  fixedTransactions,
  categories,
  type,
  dateFrom,
  dateTo,
}: ProvisionedTransactionsByCategoryProps) {
  const { formatCurrency } = useSettings();

  const categoryTotals = useMemo(() => {
    // Buscar valores iniciais provisionados nas transações fixas
    const fixedProvisions = fixedTransactions.filter(t => {
      if (!t.is_provision) return false;
      if (t.type !== type) return false;
      return true;
    });

    // Buscar despesas reais (apenas completed) NO PERÍODO filtrado
    const realExpenses = transactions.filter(t => {
      // Filtrar por tipo
      if (t.type !== type) return false;
      
      // Apenas despesas reais (não provisões)
      if (t.is_provision) return false;

      // Apenas transações concluídas (excluir pendentes)
      if (t.status !== 'completed') return false;

      // Excluir transações fixas/recorrentes
      if (t.is_fixed) return false;

      // Filtrar por data
      const transactionDate = typeof t.date === 'string' ? t.date : t.date.toISOString().split('T')[0];
      if (dateFrom && transactionDate < dateFrom) return false;
      if (dateTo && transactionDate > dateTo) return false;

      // Excluir transferências
      if (t.to_account_id) return false;

      return true;
    });
    
    // Agrupar por categoria - APENAS categorias que TÊM provisões fixas
    const categoryMap = new Map<string, CategoryTotal>();
    
    // Criar mapa com valores iniciais das transações fixas
    fixedProvisions.forEach(t => {
      const category = categories.find(c => c.id === t.category_id);
      if (!category) return;

      const initialAmount = Math.abs(t.amount);
      categoryMap.set(t.category_id, {
        categoryId: t.category_id,
        categoryName: category.name,
        categoryColor: category.color,
        totalProvisioned: initialAmount, // Valor original da transação fixa
        totalCompleted: 0,
      });
    });

    // Somar despesas reais de cada categoria
    realExpenses.forEach(t => {
      const existing = categoryMap.get(t.category_id);
      if (!existing) return; // Só soma se houver provisão para essa categoria

      const amount = Math.abs(t.amount);
      existing.totalCompleted += amount;
    });
    
    // Ordenar por valor provisionado (maior para menor)
    return Array.from(categoryMap.values())
      .sort((a, b) => b.totalProvisioned - a.totalProvisioned);
  }, [transactions, fixedTransactions, categories, type, dateFrom, dateTo]);

  const { totalProvisioned, totalCompleted } = useMemo(() => {
    return categoryTotals.reduce(
      (acc, cat) => ({
        totalProvisioned: acc.totalProvisioned + cat.totalProvisioned,
        totalCompleted: acc.totalCompleted + cat.totalCompleted,
      }),
      { totalProvisioned: 0, totalCompleted: 0 }
    );
  }, [categoryTotals]);

  const isIncome = type === 'income';
  const title = isIncome ? 'Receitas Provisionadas' : 'Despesas Provisionadas';
  const icon = isIncome ? TrendingUp : TrendingDown;
  const Icon = icon;
  const colorClass = isIncome ? 'text-success' : 'text-destructive';
  const bgColorClass = isIncome ? 'bg-success/10' : 'bg-destructive/10';

  return (
    <Card className="financial-card h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full ${bgColorClass} flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${colorClass}`} />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {categoryTotals.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
            {categoryTotals.map((category) => {
              const percentage = category.totalProvisioned > 0 
                ? (category.totalCompleted / category.totalProvisioned) * 100 
                : 0;
              const isOverBudget = percentage > 100;
              
              return (
                <div 
                  key={category.categoryId} 
                  className={`space-y-1 p-2 rounded-lg transition-all ${isOverBudget ? 'bg-amber-500/10 border border-amber-500/30' : ''}`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.categoryColor }}
                      />
                      <span className="truncate text-foreground">{category.categoryName}</span>
                    </div>
                    <div className="flex flex-col items-end ml-2">
                      <span className={`font-medium text-xs ${isOverBudget ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                        {formatCurrency(category.totalCompleted)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        de {formatCurrency(category.totalProvisioned)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget 
                          ? 'bg-amber-500' 
                          : isIncome ? 'bg-success' : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <div className={`text-xs text-right ${isOverBudget ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                    {percentage.toFixed(1)}% realizado
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhuma transação provisionada encontrada
          </div>
        )}
      </CardContent>
    </Card>
  );
}
