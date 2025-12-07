import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useRef, useEffect } from "react";

interface AnalyticsHeaderProps {
  onExportPDF?: () => void;
}

export function AnalyticsHeader({ onExportPDF }: AnalyticsHeaderProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Permite que AnalyticsPage chame a função via ref
  useEffect(() => {
    if (triggerRef.current) {
      (window as any).analyticsExportPDF = () => {
        triggerRef.current?.click();
      };
    }
  }, []);

  const handleClick = () => {
    if (onExportPDF) {
      onExportPDF();
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={handleClick}
        className="gap-1.5 apple-interaction h-8 text-xs"
      >
        <Download className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="hidden md:inline">Exportar PDF</span>
      </Button>
    </div>
  );
}
