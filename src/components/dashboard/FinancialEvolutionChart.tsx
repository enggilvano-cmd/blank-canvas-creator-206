import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { useChartResponsive } from '@/hooks/useChartResponsive';
import { useSettings } from '@/context/SettingsContext';
import { useDashboardChartData, ChartScaleType } from '@/hooks/useDashboardChartData';
import type { Account, Transaction, DateFilterType } from '@/types';
import { cn } from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { formatCurrencyForAxis, getBarChartAxisProps } from '@/lib/chartUtils';
import { Bar, Line, ComposedChart, XAxis, YAxis, ResponsiveContainer } from 'recharts';

interface FinancialEvolutionChartProps {
  transactions: Transaction[];
  accounts: Account[];
  dateFilter: DateFilterType;
  selectedMonth: Date;
  customStartDate: Date | undefined;
  customEndDate: Date | undefined;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: {
    saldo?: number;
    month?: string;
  };
  index: number;
}

export function FinancialEvolutionChart({
  transactions,
  accounts,
  dateFilter,
  selectedMonth,
  customStartDate,
  customEndDate,
}: FinancialEvolutionChartProps) {
  const { formatCurrency } = useSettings();
  const { chartConfig: responsiveConfig, isMobile } = useChartResponsive();
  const [chartScale, setChartScale] = useState<ChartScaleType>('monthly');
  const [chartYear, setChartYear] = useState<number>(new Date().getFullYear());
  const [hasAnimated, setHasAnimated] = useState(false);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    transactions.forEach((transaction) => {
      const transactionDate =
        typeof transaction.date === 'string'
          ? new Date(transaction.date)
          : transaction.date;
      years.add(transactionDate.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const chartData = useDashboardChartData(
    transactions,
    accounts,
    chartScale,
    chartYear,
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate
  );


  // Memoize tooltip formatter to prevent re-renders
  const tooltipFormatter = useMemo(
    () => (value: number, name: string) => [
      formatCurrency(value),
      name === 'receitas'
        ? ' - Receitas'
        : name === 'despesas'
        ? ' - Despesas'
        : name === 'saldo'
        ? ' - Saldo Acumulado'
        : ` - ${name}`,
    ],
    [formatCurrency]
  );

  // Memoize custom dot renderer with unique keys
  const renderDot = useMemo(
    () => (props: DotProps) => {
      const { cx, cy, payload, index } = props;
      const saldo = payload?.saldo || 0;
      // Create unique key using index and month
      const uniqueKey = `dot-${index}-${payload?.month || index}`;
      return (
        <circle
          key={uniqueKey}
          cx={cx}
          cy={cy}
          r={4}
          fill={saldo >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
          stroke="hsl(var(--background))"
          strokeWidth={2}
        />
      );
    },
    [isMobile]
  );

  if (chartData.length === 0) return null;

  return (
    <Card className="financial-card">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4" />
            Evolução Financeira {chartScale === 'daily' ? 'Diária' : 'Mensal'} - Receitas vs Despesas
          </CardTitle>
          <div
            className={cn(
              'w-full gap-2',
              chartScale === 'monthly' ? 'grid grid-cols-3' : 'grid grid-cols-2',
              'sm:flex sm:flex-row sm:items-center sm:w-auto'
            )}
          >
            <Button
              variant={chartScale === 'monthly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartScale('monthly')}
              className="h-7 px-2 text-xs w-full sm:w-auto"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Mensal
            </Button>
            <Button
              variant={chartScale === 'daily' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartScale('daily')}
              className="h-7 px-2 text-xs w-full sm:w-auto"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Diário
            </Button>

            {chartScale === 'monthly' && (
              <Select value={chartYear.toString()} onValueChange={(value) => setChartYear(parseInt(value))}>
                <SelectTrigger className="h-7 w-full text-xs sm:w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.length > 0 ? (
                    availableYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={new Date().getFullYear().toString()}>
                      {new Date().getFullYear()}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="relative min-h-[200px] sm:min-h-[300px] lg:min-h-[350px]">
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[250px] sm:h-[250px] text-muted-foreground">
              <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm font-medium">Nenhum dado disponível</p>
            </div>
          ) : (
            <ChartContainer
              config={{
                receitas: {
                  label: 'Receitas',
                  color: 'hsl(var(--success))',
                },
                despesas: {
                  label: 'Despesas',
                  color: 'hsl(var(--destructive))',
                },
                saldo: {
                  label: 'Saldo Acumulado',
                  color: 'hsl(var(--primary))',
                },
              }}
              className="h-[300px] sm:h-[300px] lg:h-[350px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: isMobile ? 0 : 30,
                    left: isMobile ? -10 : 20,
                    bottom: isMobile ? (chartScale === 'daily' ? 60 : 20) : 50,
                  }}
                >
                  <XAxis
                    dataKey="month"
                    {...getBarChartAxisProps(responsiveConfig).xAxis}
                    height={chartScale === 'monthly' ? 30 : responsiveConfig.axisHeight}
                    interval={
                      chartScale === 'daily'
                        ? isMobile
                          ? Math.max(0, Math.floor(chartData.length / 7))
                          : Math.max(0, Math.floor(chartData.length / 15))
                        : 0
                    }
                    minTickGap={chartScale === 'daily' ? (isMobile ? 15 : 8) : 5}
                    tickMargin={10}
                    angle={chartScale === 'daily' ? (isMobile ? -45 : -30) : 0}
                    textAnchor={chartScale === 'daily' ? 'end' : 'middle'}
                    tick={{
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: isMobile ? 10 : 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    tickFormatter={(value) => {
                      const formatted = formatCurrencyForAxis(value / 100, isMobile);
                      return isMobile ? formatted.replace('R$', '').trim() : formatted;
                    }}
                    width={isMobile ? 35 : 80}
                  />

                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="bg-background/95 backdrop-blur-sm border border-border/50 shadow-lg"
                        labelClassName="font-medium text-foreground"
                        indicator="dot"
                      />
                    }
                    formatter={tooltipFormatter}
                  />

                  {!isMobile && (
                    <ChartLegend
                      content={<ChartLegendContent className="flex justify-center gap-6" />}
                      verticalAlign="top"
                    />
                  )}

                  <Bar
                    dataKey="receitas"
                    fill="hsl(var(--success))"
                    radius={[4, 4, 0, 0]}
                    name="Receitas"
                  />

                  <Bar
                    dataKey="despesas"
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                    name="Despesas"
                  />

                  <Line
                    type="monotone"
                    dataKey="saldo"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={renderDot}
                    activeDot={{
                      r: 6,
                      strokeWidth: 2,
                      fill: 'hsl(var(--primary))',
                      stroke: 'hsl(var(--background))',
                    }}
                    connectNulls={false}
                    name="Saldo Acumulado"
                    isAnimationActive={!hasAnimated}
                    animationDuration={800}
                    animationEasing="ease-in-out"
                    onAnimationEnd={() => setHasAnimated(true)}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}

          {isMobile && chartData.length > 0 && (
            <div className="flex justify-center gap-4 mt-2 text-xs border-t pt-3">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-success"></div>
                <span className="text-muted-foreground">Receitas</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive"></div>
                <span className="text-muted-foreground">Despesas</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-primary"></div>
                <span className="text-muted-foreground">Saldo</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
