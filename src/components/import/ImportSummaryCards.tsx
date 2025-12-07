import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Copy, AlertTriangle, XCircle } from "lucide-react";

interface ImportSummaryCardsProps {
  summary: {
    new: number;
    duplicates: number;
    invalid: number;
    excluded: number;
  };
}

export function ImportSummaryCards({ summary }: ImportSummaryCardsProps) {
  const cards = [
    {
      icon: PlusCircle,
      value: summary.new,
      label: "Novas",
      colorClass: "text-primary",
      bgClass: "bg-primary/10",
    },
    {
      icon: Copy,
      value: summary.duplicates,
      label: "Duplicatas",
      colorClass: "text-amber-500",
      bgClass: "bg-amber-500/10",
    },
    {
      icon: AlertTriangle,
      value: summary.invalid,
      label: "Com Erros",
      colorClass: "text-destructive",
      bgClass: "bg-destructive/10",
    },
    {
      icon: XCircle,
      value: summary.excluded,
      label: "Excluídas",
      colorClass: "text-muted-foreground",
      bgClass: "bg-muted/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className={`${card.bgClass} border-none`}>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <Icon className={`h-5 w-5 ${card.colorClass}`} />
                <div className={`text-3xl font-bold ${card.colorClass}`}>
                  {card.value}
                </div>
                <p className="text-caption text-muted-foreground leading-tight">
                  {card.label}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
