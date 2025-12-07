import { Button } from '@/components/ui/button';
import { ArrowRightLeft, TrendingDown, TrendingUp, CreditCard } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  onTransfer: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onAddCreditExpense: () => void;
  isHeaderVersion?: boolean;
}

export function DashboardHeader({
  onTransfer,
  onAddExpense,
  onAddIncome,
  onAddCreditExpense,
  isHeaderVersion = false,
}: DashboardHeaderProps) {
  const isMobile = useIsMobile();

  const buttons = (
    <>
      <Button
        onClick={onTransfer}
        variant="outline"
        className="gap-1.5 apple-interaction h-8 text-xs"
        aria-label="Transferência"
      >
        <ArrowRightLeft className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">Transferência</span>
      </Button>
      <Button
        onClick={onAddExpense}
        variant="destructive"
        className="gap-1.5 apple-interaction h-8 text-xs"
        aria-label="Despesa"
      >
        <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">Despesa</span>
      </Button>
      <Button
        onClick={onAddIncome}
        variant="default"
        className="gap-1.5 apple-interaction h-8 text-xs bg-success hover:bg-success/90"
        aria-label="Receita"
      >
        <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">Receita</span>
      </Button>
      <Button
        onClick={onAddCreditExpense}
        variant="outline"
        className="gap-1.5 apple-interaction h-8 text-xs border-warning text-warning hover:bg-warning hover:text-warning-foreground"
        aria-label="Cartão de Crédito"
      >
        <CreditCard className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">Cartão</span>
      </Button>
    </>
  );

  // Version for header (fixed) - only rendered in Layout
  if (isHeaderVersion) {
    return <div className="flex items-center gap-2">{buttons}</div>;
  }

  // Version for page (mobile and desktop)
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 w-full md:grid-cols-4 lg:flex lg:flex-nowrap lg:gap-2 lg:w-auto">
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 w-full md:grid-cols-4 lg:flex lg:flex-nowrap lg:gap-2 lg:w-auto">
      {buttons}
    </div>
  );
}
