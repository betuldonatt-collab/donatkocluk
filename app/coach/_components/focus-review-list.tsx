"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creditedSecondsFromMinutes, formatFocusDuration } from "@/lib/focus-approval";
import { reviewFocusSession, type PendingFocusReview } from "../actions";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

type Mode = "idle" | "editing" | "confirmingReject";

// Reviews of suspiciously long (> 6 h) Süre Tut sessions. For each the coach
// can approve it as recorded, cut it down to a realistic figure and approve
// that, or reject it. Nothing here counts toward the leaderboard / charts /
// totals until approved (see migration 0086). Shared by the dashboard dialog
// (showStudent) and the student detail card.
export function FocusReviewList({
  reviews,
  showStudent,
  onResolved,
}: {
  reviews: PendingFocusReview[];
  showStudent: boolean;
  // Called once a review has been decided (or found already decided), so the
  // parent can drop it from its list.
  onResolved: (reviewId: string) => void;
}) {
  if (reviews.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Onay bekleyen süre yok.</p>;
  }
  return (
    <div className="space-y-2">
      {reviews.map((review) => (
        <FocusReviewRow key={review.id} review={review} showStudent={showStudent} onResolved={onResolved} />
      ))}
    </div>
  );
}

function FocusReviewRow({
  review,
  showStudent,
  onResolved,
}: {
  review: PendingFocusReview;
  showStudent: boolean;
  onResolved: (reviewId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const fullMinutes = Math.floor(review.seconds / 60);
  const [minutes, setMinutes] = useState(String(fullMinutes));

  const editedSeconds = creditedSecondsFromMinutes(Number(minutes), review.seconds);
  const editValid = minutes.trim() !== "" && editedSeconds !== null;

  function run(decision: Parameters<typeof reviewFocusSession>[1], successMessage: string) {
    startTransition(async () => {
      try {
        const result = await reviewFocusSession(review.id, decision);
        if (result.ok) {
          toast.success(successMessage);
          onResolved(review.id);
          return;
        }
        toast.error(result.error);
        // Already decided elsewhere (second tab / co-coach): nothing left to do here.
        if (result.alreadyProcessed) onResolved(review.id);
      } catch {
        toast.error("İşlem yapılamadı, tekrar dene.");
      }
    });
  }

  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          {showStudent && (
            <Link href={`/coach/students/${review.studentId}`} className="text-foreground text-sm font-semibold hover:underline">
              {review.studentName ?? "İsimsiz Öğrenci"}
            </Link>
          )}
          <p className="text-foreground truncate text-sm font-medium" title={review.taskTitle}>
            {review.taskTitle}
          </p>
          <p className="text-muted-foreground text-xs">
            {review.startedAt ? `${formatWhen(review.startedAt)} – ` : ""}
            {formatWhen(review.endedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-amber-600">{formatFocusDuration(review.seconds)}</p>
          <p className="text-muted-foreground text-[11px]">tek seansta kaydedilen</p>
        </div>
      </div>

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => run({ action: "approve" }, `${formatFocusDuration(review.seconds)} onaylandı.`)}
          >
            Onayla
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setMode("editing")}>
            Süreyi Düzenle
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() => setMode("confirmingReject")}
          >
            Reddet
          </Button>
        </div>
      )}

      {mode === "editing" && (
        <div className="space-y-2">
          <div className="max-w-[220px] space-y-1.5">
            <Label htmlFor={`focus-review-${review.id}`} className="text-xs">
              Onaylanacak süre (dakika)
            </Label>
            <Input
              id={`focus-review-${review.id}`}
              type="number"
              min={1}
              max={fullMinutes}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))}
              aria-invalid={!editValid || undefined}
              className="bg-background h-8"
            />
            <p className={editValid ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>
              {editValid
                ? `${formatFocusDuration(editedSeconds!)} sayılacak, gerisi silinecek.`
                : `1 ile ${fullMinutes} dakika arasında gir.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending || !editValid}
              onClick={() =>
                run({ action: "approve", approvedMinutes: Number(minutes) }, `${formatFocusDuration(editedSeconds!)} olarak onaylandı.`)
              }
            >
              Düzenle ve Onayla
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("idle")}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      {mode === "confirmingReject" && (
        <div className="space-y-2">
          <p className="text-destructive text-xs">
            Bu seans tamamen silinecek ve hiçbir süre eklenmeyecek. Emin misin?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => run({ action: "reject" }, "Süre reddedildi.")}
            >
              Evet, reddet
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("idle")}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
