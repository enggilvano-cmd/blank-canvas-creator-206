import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DatePicker } from '@/components/ui/date-picker';
import type { DateFilterType } from '@/types';

interface FilterCardProps {
  dateFilter: DateFilterType;
  setDateFilter: (value: DateFilterType) => void;
  selectedMonth: Date;
  customStartDate: Date | undefined;
  setCustomStartDate: (date: Date | undefined) => void;
  customEndDate: Date | undefined;
  setCustomEndDate: (date: Date | undefined) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
}

export function FilterCard({
  dateFilter,
  setDateFilter,
  selectedMonth,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  goToPreviousMonth,
  goToNextMonth,
}: FilterCardProps) {
  return (
    <Card className="financial-card h-full flex flex-col justify-center">
      <CardContent className="p-3 w-full">
        <div className="space-y-3">
          <div>
            <label id="period-filter-label" className="text-caption font-medium mb-1.5 block text-foreground">
              Período
            </label>
            <Select value={dateFilter} onValueChange={(value: DateFilterType) => setDateFilter(value)}>
              <SelectTrigger className="h-8 text-body" aria-labelledby="period-filter-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Transações</SelectItem>
                <SelectItem value="current_month">Mês Atual</SelectItem>
                <SelectItem value="month_picker">Navegar por Mês</SelectItem>
                <SelectItem value="custom">Período Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateFilter === 'month_picker' && (
            <div>
              <label id="month-navigation-label" className="text-caption font-medium mb-1.5 block text-foreground">
                Mês
              </label>
              <div className="flex items-center gap-1 h-8 px-2 border border-input rounded-md bg-background">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousMonth}
                  className="h-5 w-5 p-0 hover:bg-accent"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                </Button>
                <span className="flex-1 text-center text-body font-medium" aria-live="polite">
                  {format(selectedMonth, 'MMM/yy', { locale: ptBR })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextMonth}
                  className="h-5 w-5 p-0 hover:bg-accent"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {dateFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label id="start-date-label" className="text-caption font-medium mb-1.5 block text-foreground">
                  Início
                </label>
                <DatePicker
                  date={customStartDate}
                  onDateChange={setCustomStartDate}
                  placeholder="Inicial"
                  className="h-8 text-body"
                />
              </div>

              <div>
                <label id="end-date-label" className="text-caption font-medium mb-1.5 block text-foreground">
                  Final
                </label>
                <DatePicker
                  date={customEndDate}
                  onDateChange={setCustomEndDate}
                  placeholder="Final"
                  className="h-8 text-body"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
