import { cn } from "@/lib/utils";

// The number of missed topics in a bucket for one exam (the bucketed Deneme
// Analizi tables show this instead of a single mark, so a bucket with several
// misses reads as more severe than one with a single miss). Nothing for zero.
export function MissCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} konuda hata`}
      className={cn(
        "mx-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        count >= 3 ? "bg-rose-500/30 text-rose-700" : "bg-rose-500/15 text-rose-600",
      )}
    >
      {count}
    </span>
  );
}
