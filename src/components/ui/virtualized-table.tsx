import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent } from "@/components/ui/card";
import { useResponsiveTable } from "@/hooks/useResponsiveTable";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  width?: string;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: string;
  emptyState?: React.ReactNode;
  className?: string;
  estimateSize?: number;
  overscan?: number;
}

export function VirtualizedTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  emptyState,
  className,
  estimateSize = 80,
  overscan = 5,
}: VirtualizedTableProps<T>) {
  const tableConfig = useResponsiveTable();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (data.length === 0) {
    return emptyState || (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nenhum item encontrado</p>
      </div>
    );
  }

  // Mobile card layout with virtualization
  if (tableConfig.showMobileCards) {
    return (
      <div
        ref={parentRef}
        className={cn("h-[600px] overflow-auto", tableConfig.spacing, className)}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            return (
              <div
                key={item[keyField] as React.Key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Card className="financial-card border border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all duration-200 mb-3">
                  <CardContent className={cn(tableConfig.padding, "space-y-3")}>
                    <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/30">
                      <div className="flex-1 min-w-0">
                        {columns[0] && (
                          <div className="font-semibold text-foreground leading-tight">
                            {columns[0].render(item)}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {columns[columns.length - 1] && columns[columns.length - 1].render(item)}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {columns
                        .slice(1, -1)
                        .filter((col) => !col.hideOnMobile)
                        .map((column) => (
                          <div key={column.key} className="flex justify-between items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-shrink-0">
                              {column.mobileLabel || column.header}
                            </span>
                            <div className="text-sm text-foreground text-right flex-1 min-w-0 font-medium">
                              {column.render(item)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Tablet multi-row layout with virtualization
  if (tableConfig.showTabletMultiRow) {
    return (
      <div
        ref={parentRef}
        className={cn("h-[600px] overflow-auto", tableConfig.spacing, className)}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            return (
              <div
                key={item[keyField] as React.Key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Card className="financial-card mb-3">
                  <CardContent className={tableConfig.padding}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {columns[0] && columns[0].render(item)}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {columns.find((col) => col.key === "amount") && (
                            <div className="text-right">
                              {columns.find((col) => col.key === "amount")?.render(item)}
                            </div>
                          )}
                          {columns[columns.length - 1] && columns[columns.length - 1].render(item)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-4 flex-wrap">
                          {columns.find((col) => col.key === "type") && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Tipo:</span>
                              {columns.find((col) => col.key === "type")?.render(item)}
                            </div>
                          )}
                          {columns.find((col) => col.key === "category") && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Categoria:</span>
                              <span className="text-sm">
                                {columns.find((col) => col.key === "category")?.render(item)}
                              </span>
                            </div>
                          )}
                          {columns.find((col) => col.key === "account") && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Conta:</span>
                              <span className="text-sm">
                                {columns.find((col) => col.key === "account")?.render(item)}
                              </span>
                            </div>
                          )}
                        </div>
                        {columns.find((col) => col.key === "status") && (
                          <div className="flex-shrink-0">
                            {columns.find((col) => col.key === "status")?.render(item)}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop table layout with virtualization
  const getVisibleColumns = () => {
    const width = window.innerWidth;
    let filteredColumns = columns.filter((col, index) => {
      if (index === 0 || index === columns.length - 1) return true;
      if (col.hideOnMobile && width < 640) return false;
      return true;
    });
    return filteredColumns.slice(0, tableConfig.maxColumns);
  };

  const visibleColumns = getVisibleColumns();

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-hidden">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b">
              {visibleColumns.map((column, index) => (
                <th
                  key={column.key}
                  className={cn(
                    "text-left font-medium text-muted-foreground truncate",
                    tableConfig.padding,
                    tableConfig.headerSize
                  )}
                  style={{
                    width:
                      column.width ||
                      (index === 0
                        ? "30%"
                        : index === visibleColumns.length - 1
                        ? "15%"
                        : `${Math.floor(55 / (visibleColumns.length - 2))}%`),
                  }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div ref={parentRef} className="h-[600px] overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <table className="w-full table-fixed">
              <tbody>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = data[virtualRow.index];
                  return (
                    <tr
                      key={item[keyField] as React.Key}
                      className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {visibleColumns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(tableConfig.padding, tableConfig.fontSize, "truncate")}
                          style={{
                            width:
                              column.width ||
                              (visibleColumns.indexOf(column) === 0
                                ? "30%"
                                : visibleColumns.indexOf(column) === visibleColumns.length - 1
                                ? "15%"
                                : `${Math.floor(55 / (visibleColumns.length - 2))}%`),
                          }}
                        >
                          <div className="w-full overflow-hidden">{column.render(item)}</div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
