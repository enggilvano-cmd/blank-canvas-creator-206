import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Single row skeleton for transaction table
 */
function TransactionRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border last:border-b-0">
      {/* Transaction info (icon + description + date) */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-24" />
          {/* Mobile: category and account */}
          <div className="block sm:hidden space-y-1 mt-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>

      {/* Category (hidden on mobile) */}
      <div className="hidden sm:block w-[15%] px-2">
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Account (hidden on mobile) */}
      <div className="hidden sm:block w-[15%] px-2">
        <Skeleton className="h-3 w-24" />
      </div>

      {/* Amount */}
      <div className="w-[20%] text-right px-2">
        <Skeleton className="h-4 w-24 ml-auto" />
      </div>

      {/* Status (hidden on mobile) */}
      <div className="hidden md:block w-[12%] px-2">
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      {/* Actions */}
      <div className="w-[8%] flex justify-end px-2">
        <Skeleton className="w-8 h-8 rounded-md" />
      </div>
    </div>
  );
}

interface TransactionTableSkeletonProps {
  rows?: number;
  showCount?: boolean;
}

/**
 * Complete table skeleton with header and rows
 * Used while loading transactions
 */
export function TransactionTableSkeleton({
  rows = 10,
  showCount = true,
}: TransactionTableSkeletonProps) {
  return (
    <Card className="financial-card">
      <CardHeader className="px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          {showCount && <Skeleton className="h-5 w-12 rounded-full" />}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <TransactionRowSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact skeleton for transaction list (without card wrapper)
 * Used in smaller components or modals
 */
export function TransactionListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <TransactionRowSkeleton key={i} />
      ))}
    </div>
  );
}
