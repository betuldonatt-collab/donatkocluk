import { CheckCircle2, Clock, Timer, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFocusDuration, type FocusReviewStatus } from "@/lib/focus-approval";

export type StudentFocusReview = {
  id: string;
  taskTitle: string;
  seconds: number;
  status: FocusReviewStatus;
  approvedSeconds: number | null;
  endedAt: string;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ review }: { review: StudentFocusReview }) {
  if (review.status === "pending") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
        title="6 saati aşan seanslar koçunun onayından sonra sıralamaya ve istatistiklere eklenir."
      >
        <Clock className="size-3" />
        Koç Onayı Bekliyor
      </span>
    );
  }
  if (review.status === "approved") {
    const credited = review.approvedSeconds ?? review.seconds;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Onaylandı{credited < review.seconds ? ` · ${formatFocusDuration(credited)} sayıldı` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
      <XCircle className="size-3" />
      Reddedildi
    </span>
  );
}

// The student's own view of their long Süre Tut sessions. A session over 6
// hours isn't counted until the coach approves it, so this is where the
// student sees WHY their time / leaderboard rank hasn't moved. Rendered only
// when there is at least one such session.
export function FocusReviewsCard({ reviews }: { reviews: StudentFocusReview[] }) {
  const hasPending = reviews.some((r) => r.status === "pending");
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="text-muted-foreground size-4" />
          Uzun Süre Kayıtların
        </CardTitle>
        {hasPending && (
          <p className="text-muted-foreground text-xs">
            Tek seansta 6 saati aşan süreler koçunun onayını bekliyor. Onaylanana kadar sıralamana ve toplam süreni
            etkilemez.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-border divide-y">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-medium" title={review.taskTitle}>
                  {review.taskTitle}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatWhen(review.endedAt)} · {formatFocusDuration(review.seconds)}
                </p>
              </div>
              <StatusBadge review={review} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
