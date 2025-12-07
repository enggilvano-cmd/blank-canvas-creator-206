import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

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
  const isShowingAll = pageSize === null;
  const startItem = isShowingAll ? 1 : currentPage * pageSize + 1;
  const endItem = isShowingAll ? totalCount : Math.min((currentPage + 1) * pageSize, totalCount);

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
