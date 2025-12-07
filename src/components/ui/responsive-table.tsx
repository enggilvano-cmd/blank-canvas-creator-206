import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useResponsiveTable } from "@/hooks/useResponsiveTable";
import { cn } from "@/lib/utils";
import { VirtualizedTable } from "./virtualized-table";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  width?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: string;
  emptyState?: React.ReactNode;
  className?: string;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  emptyState,
  className
}: ResponsiveTableProps<T>) {
  const tableConfig = useResponsiveTable();

  // Use virtualization for large lists (>100 items) to improve performance
  if (data.length > 100) {
    return (
      <VirtualizedTable
        data={data}
        columns={columns}
        keyField={keyField}
        emptyState={emptyState}
        className={className}
      />
    );
  }

  if (data.length === 0) {
    return emptyState || (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nenhum item encontrado</p>
      </div>
    );
  }

  // Mobile card layout
  if (tableConfig.showMobileCards) {
    return (
      <div className={cn(tableConfig.spacing, className)}>
        {data.map((item) => (
          <Card key={item[keyField] as React.Key} className="financial-card border border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all duration-200">
            <CardContent className={cn(tableConfig.padding, "space-y-3")}>
              {/* Main info row - destacar informação principal */}
              <div className="flex items-start justify-between gap-3 pb-2 border-b border-border/30">
                <div className="flex-1 min-w-0">
                  {columns[0] && (
                    <div className="font-semibold text-foreground leading-tight">
                      {columns[0].render(item)}
                    </div>
                  )}
                </div>
                {/* Actions no canto superior direito */}
                <div className="flex-shrink-0">
                  {columns[columns.length - 1] && columns[columns.length - 1].render(item)}
                </div>
              </div>
              
              {/* Secondary info */}
              <div className="space-y-2.5">
                {columns
                  .slice(1, -1) // Remove primeira e última coluna (já mostradas acima)
                  .filter(col => !col.hideOnMobile)
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
        ))}
      </div>
    );
  }

  // Tablet multi-row layout
  if (tableConfig.showTabletMultiRow) {
    return (
      <div className={cn(tableConfig.spacing, className)}>
        {data.map((item) => (
          <Card key={item[keyField] as React.Key} className="financial-card">
            <CardContent className={tableConfig.padding}>
              <div className="space-y-3">
                {/* Primary row - Main info */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {columns[0] && columns[0].render(item)}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Amount */}
                    {columns.find(col => col.key === 'amount') && (
                      <div className="text-right">
                        {columns.find(col => col.key === 'amount')?.render(item)}
                      </div>
                    )}
                    {/* Actions */}
                    {columns[columns.length - 1] && columns[columns.length - 1].render(item)}
                  </div>
                </div>
                
                {/* Secondary row - Additional info */}
                <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Type */}
                    {columns.find(col => col.key === 'type') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Tipo:</span>
                        {columns.find(col => col.key === 'type')?.render(item)}
                      </div>
                    )}
                    {/* Category */}
                    {columns.find(col => col.key === 'category') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Categoria:</span>
                        <span className="text-sm">
                          {columns.find(col => col.key === 'category')?.render(item)}
                        </span>
                      </div>
                    )}
                    {/* Account */}
                    {columns.find(col => col.key === 'account') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Conta:</span>
                        <span className="text-sm">
                          {columns.find(col => col.key === 'account')?.render(item)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Status */}
                  {columns.find(col => col.key === 'status') && (
                    <div className="flex-shrink-0">
                      {columns.find(col => col.key === 'status')?.render(item)}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Desktop/Tablet table layout  
  // Filter columns based on screen size and configuration
  const getVisibleColumns = () => {
    const width = window.innerWidth;
    
    // Filter columns based on hideOnMobile property and screen size
    let filteredColumns = columns.filter((col, index) => {
      // Always show first and last columns (info and actions)
      if (index === 0 || index === columns.length - 1) return true;
      
      // Hide columns marked as hideOnMobile on small screens
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
          <thead>
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
                    width: column.width || 
                    (index === 0 ? '30%' : 
                     index === visibleColumns.length - 1 ? '15%' : 
                     `${Math.floor(55 / (visibleColumns.length - 2))}%`)
                  }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr 
                key={item[keyField] as React.Key} 
                className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                {visibleColumns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      tableConfig.padding,
                      tableConfig.fontSize,
                      "truncate"
                    )}
                  >
                    <div className="w-full overflow-hidden">
                      {column.render(item)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}