import { AlertTriangle, BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";

// Paid-count minus completed-count -- deliberately allowed to go negative
// (0084_session_payment_tracking.sql) rather than being clamped at 0. The
// negative number and warning color are the only signal here on purpose --
// no explicit payment-reminder text, so as not to put financial stress on
// the student.
export function RemainingSessionsCard({ remaining }: { remaining: number }) {
  const isNegative = remaining < 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-5 py-4",
        isNegative ? "border-rose-300 bg-rose-500/10 dark:border-rose-800/50" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          isNegative ? "bg-rose-500/15" : "bg-primary/15",
        )}
      >
        {isNegative ? <AlertTriangle className="size-5 text-rose-600" /> : <BookOpen className="text-primary size-5" />}
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Kalan Görüşme Hakkı</p>
        <p className={cn("text-xl font-semibold tabular-nums", isNegative ? "text-rose-600" : "text-foreground")}>
          {remaining}
        </p>
      </div>
    </div>
  );
}
