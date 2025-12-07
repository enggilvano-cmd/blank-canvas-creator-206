import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for transaction statistics cards
 * Matches the visual structure of the actual stat cards
 */
export function StatCardSkeleton() {
  return (
    <Card className="financial-card">
      <CardContent className="p-3">
        <div className="flex flex-col items-center text-center gap-3">
          {/* Icon skeleton */}
          <Skeleton className="w-10 h-10 rounded-full" />
          
          {/* Text content skeleton */}
          <div className="w-full space-y-2">
            {/* Label skeleton */}
            <Skeleton className="h-4 w-24 mx-auto" />
            
            {/* Value skeleton */}
            <Skeleton className="h-8 w-32 mx-auto" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Grid of 4 stat card skeletons
 * Used while loading transaction statistics
 */
export function StatCardsSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
  );
}
