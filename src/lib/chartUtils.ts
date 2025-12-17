import { ChartDimensions } from "@/hooks/useChartResponsive";
import type { ChartDataItem } from "@/types/export";

export function formatCurrencyForAxis(value: number, isMobile: boolean): string {
  const realValue = value / 100;

  if (isMobile) {
    if (Math.abs(realValue) >= 1000000) {
      return `R$ ${(realValue / 1000000).toFixed(1)}M`;
    } else if (Math.abs(realValue) >= 1000) {
      return `R$ ${(realValue / 1000).toFixed(0)}k`;
    } else {
      return `R$ ${realValue.toFixed(0)}`;
    }
  }
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(realValue);
}

export function getPieChartProps(chartConfig: ChartDimensions, data: ChartDataItem[]) {
  return {
    cx: "50%",
    cy: "50%",
    labelLine: false,
    label: chartConfig.showLabels && data.length <= 8 
      ? ({ name, percentage }: ChartDataItem) => `${name}: ${percentage?.toFixed(1) ?? '0.0'}%` 
      : false,
    outerRadius: chartConfig.outerRadius,
    fill: "#8884d8",
    dataKey: "amount"
  };
}

export function getBarChartAxisProps(chartConfig: ChartDimensions) {
  return {
    xAxis: {
      tick: { fontSize: chartConfig.tickFontSize },
      angle: chartConfig.angleRotation,
      textAnchor: chartConfig.textAnchor,
      height: chartConfig.axisHeight,
    },
    yAxis: {
      tick: { fontSize: chartConfig.tickFontSize },
    }
  };
}

export function getLineChartProps(chartConfig: ChartDimensions) {
  return {
    strokeWidth: chartConfig.strokeWidth,
    dot: { 
      strokeWidth: 2, 
      r: chartConfig.dotRadius 
    },
    activeDot: { 
      r: chartConfig.activeDotRadius, 
      strokeWidth: 2 
    }
  };
}

export function getComposedChartMargins(chartConfig: ChartDimensions) {
  return chartConfig.margins;
}