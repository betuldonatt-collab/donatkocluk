"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MISSED_REASON_LABELS, type CoachingSession, type RosterStudent } from "../../dashboard/types";

// Coach anonymity: this component must NEVER see a per-session rating or
// feedback text tied to a named student, so the prop type deliberately
// omits student_rating/student_feedback/rated_at rather than trusting
// every render path to just "not display" them. The only place a rating
// is ever surfaced to the coach is the same-day aggregate in
// MonthlySummary.
type DaySession = Pick<
  CoachingSession,
  "id" | "student_id" | "scheduled_at" | "outcome" | "missed_reason" | "missed_reason_note"
>;

const OUTCOME_LABELS: Record<CoachingSession["outcome"], string> = {
  pending: "Planlanan",
  completed: "Gerçekleşen",
  not_happened: "Gerçekleşmeyen",
};

export function DayDetailSheet({
  date,
  sessions,
  roster,
  open,
  onOpenChange,
}: {
  date: string | null;
  sessions: DaySession[];
  roster: RosterStudent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formattedDate = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{formattedDate}</SheetTitle>
          <SheetDescription>{sessions.length} görüşme</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {sessions
            .slice()
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
            .map((session) => {
              const student = roster.find((s) => s.id === session.student_id);
              return (
                <div key={session.id} className="border-border rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-foreground text-sm font-medium">{student?.full_name ?? "Öğrenci"}</p>
                    <span className="text-muted-foreground text-xs">
                      {new Date(session.scheduled_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{OUTCOME_LABELS[session.outcome]}</p>

                  {session.outcome === "not_happened" && session.missed_reason && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {MISSED_REASON_LABELS[session.missed_reason]}
                      {session.missed_reason_note ? `: ${session.missed_reason_note}` : ""}
                    </p>
                  )}

                  <Link
                    href={`/coach/students/${session.student_id}`}
                    className="text-primary mt-2 inline-block text-xs underline"
                  >
                    Öğrenci detayına git
                  </Link>
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
