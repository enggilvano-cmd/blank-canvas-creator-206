import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface PaginationControlsProps {
  currentPage: number;
  pageCount: number;
  totalCount: number;
  pageSize: number | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | null) => void;
  pageSizeOptions?: number[];
}

export function PaginationControls({
  currentPage,
  pageCount,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
}: PaginationControlsProps) {
  const isMobile = useIsMobile();
  const isShowingAll = pageSize === null;
  const startItem = isShowingAll ? 1 : currentPage * pageSize + 1;
  const endItem = isShowingAll ? totalCount : Math.min((currentPage + 1) * pageSize, totalCount);

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3 px-2 py-3">
        {/* Primeira linha: Info de registros e tamanho da página */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {startItem}-{endItem} de {totalCount}
          </span>
          <Select
            value={pageSize === null ? "all" : pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(value === "all" ? null : Number(value))}
          >
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Segunda linha: Botões de navegação e página */}
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(0)}
            disabled={currentPage === 0 || isShowingAll}
            title="Primeira página"
          >
            <ChevronsLeft className="h-3 w-3" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 0 || isShowingAll}
            title="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          
          <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded bg-muted/30">
            {isShowingAll ? "Todas" : `${currentPage + 1}/${Math.max(pageCount, 1)}`}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pageCount - 1 || isShowingAll}
            title="Próxima página"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(pageCount - 1)}
            disabled={currentPage >= pageCount - 1 || isShowingAll}
            title="Última página"
          >
            <ChevronsRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Mostrando {startItem}-{endItem} de {totalCount} registros
        </span>
        <Select
          value={pageSize === null ? "all" : pageSize.toString()}
          onValueChange={(value) => onPageSizeChange(value === "all" ? null : Number(value))}
        >
          <SelectTrigger className="h-8 w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span>por página</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(0)}
          disabled={currentPage === 0 || isShowingAll}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0 || isShowingAll}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">
            {isShowingAll ? "Todas as transações" : `Página ${currentPage + 1} de ${Math.max(pageCount, 1)}`}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= pageCount - 1 || isShowingAll}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(pageCount - 1)}
          disabled={currentPage >= pageCount - 1 || isShowingAll}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
