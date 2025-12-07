import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface FilterChip {
  id: string;
  label: string;
  value: string;
  color?: string;
  onRemove: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

interface TransactionFilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
}

export function TransactionFilterChips({ chips, onClearAll }: TransactionFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant="secondary"
          className="pl-2 pr-2 py-1 text-sm font-medium flex items-center gap-1 hover:bg-secondary/80 transition-colors"
        >
          {chip.onPrevious && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                chip.onPrevious?.();
              }}
              className="rounded-full hover:bg-background/50 w-7 h-7 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          
          {chip.color && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 mx-1"
              style={{ backgroundColor: chip.color }}
            />
          )}
          
          <span className={chip.id === 'period' && chip.onPrevious ? "min-w-[130px] text-center inline-block" : "px-1"}>
            {chip.label}
          </span>

          {chip.onNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                chip.onNext?.();
              }}
              className="rounded-full hover:bg-background/50 w-7 h-7 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              chip.onRemove();
            }}
            className="ml-1 rounded-full hover:bg-background/50 w-5 h-5 flex items-center justify-center transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
        >
          Limpar tudo
        </button>
      )}
    </div>
  );
}
