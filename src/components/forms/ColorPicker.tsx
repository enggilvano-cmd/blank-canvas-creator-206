import { Label } from "@/components/ui/label";
import { PREDEFINED_COLORS } from "@/types";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label = "Cor" }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-9 gap-2 sm:gap-3">
        {PREDEFINED_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 transition-all duration-200 hover:scale-110 active:scale-95 ${
              value === color 
                ? "border-foreground ring-2 ring-ring ring-offset-2 shadow-md" 
                : "border-border hover:border-foreground/60"
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            title={`Selecionar cor ${color}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        <div 
          className="w-4 h-4 rounded-full border border-border shadow-sm"
          style={{ backgroundColor: value }}
        />
        <span className="text-xs sm:text-sm text-muted-foreground">
          Cor selecionada: {value}
        </span>
      </div>
    </div>
  );
}