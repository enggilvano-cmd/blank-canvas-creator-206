import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface FilterChip {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface AccountFilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
}

export function AccountFilterChips({ chips, onClearAll }: AccountFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant="secondary"
          className="pl-3 pr-2 py-1.5 text-sm font-medium flex items-center gap-2 hover:bg-secondary/80 transition-colors"
        >
          <span>{chip.label}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              chip.onRemove();
            }}
            className="ml-1 rounded-full hover:bg-background/50 p-0.5 transition-colors"
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
