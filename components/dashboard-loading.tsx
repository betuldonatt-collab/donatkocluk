import { Skeleton } from "@/components/ui/skeleton";

// Generic content-area skeleton, shown by every role's own loading.tsx
// while a page segment's server component is fetching -- the sidebar stays
// mounted (it lives in the layout, one level up), only this content region
// swaps in during navigation instead of a blank white flash. Deliberately
// shape-agnostic (a header line + a card grid) since the 4 roles' actual
// page layouts differ too much to fake convincingly -- this only needs to
// read as "something is loading here," not mirror the real page pixel-for-pixel.
export function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-border space-y-3 rounded-xl border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
