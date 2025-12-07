import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePicker } from "@/components/ui/date-picker";

export type PeriodFilterType = 'all' | 'current_month' | 'month_picker' | 'custom';

interface PeriodFilterProps {
  value: PeriodFilterType;
  onChange: (value: PeriodFilterType) => void;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  customStartDate: Date | undefined;
  onCustomStartDateChange: (date: Date | undefined) => void;
  customEndDate: Date | undefined;
  onCustomEndDateChange: (date: Date | undefined) => void;
}

export function PeriodFilter({
  value,
  onChange,
  selectedMonth,
  onMonthChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
}: PeriodFilterProps) {
  const goToPreviousMonth = () => {
    onMonthChange(subMonths(selectedMonth, 1));
  };

  const goToNextMonth = () => {
    onMonthChange(addMonths(selectedMonth, 1));
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium mb-1.5 block">
          Período
        </label>
        <Select value={value} onValueChange={(val: PeriodFilterType) => onChange(val)}>
          <SelectTrigger>
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

      {value === 'month_picker' && (
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Mês
          </label>
          <div className="flex items-center gap-2 h-10 px-3 border border-input rounded-md bg-background">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPreviousMonth}
              className="h-6 w-6 p-0"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex-1 text-center text-sm font-medium">
              {format(selectedMonth, 'MMMM/yyyy', { locale: ptBR })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextMonth}
              className="h-6 w-6 p-0"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {value === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Data Inicial
            </label>
            <DatePicker
              date={customStartDate}
              onDateChange={onCustomStartDateChange}
              placeholder="Selecione"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Data Final
            </label>
            <DatePicker
              date={customEndDate}
              onDateChange={onCustomEndDateChange}
              placeholder="Selecione"
            />
          </div>
        </div>
      )}
    </div>
  );
}
