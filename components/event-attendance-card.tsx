import { Check, Info, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { attendanceNote, rsvpLabel, sessionStatusLabel, type ParentEventAttendance } from "@/lib/event-attendance";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// The "Etkinlik Katılımı" section of a report card -- the SAME section on the parent's, the student's and the coach's view: for every event of the period the coach took attendance for, the
// session-by-session roll call ("1. Oturum: Katıldı, 2. Oturum: Katılmadı") next to what the student said in the RSVP -- and one calm,
// factual note when they had said they would come and did not (or missed some sessions).
// Pure markup (no state), so it also prints with the rest of the card.
export function EventAttendanceCard({ events }: { events: ParentEventAttendance[] }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="event-attendance-heading">
      <h3 id="event-attendance-heading" className="text-foreground text-sm font-semibold">
        Etkinlik Katılımı
      </h3>
      <div className="space-y-3">
        {events.map((event) => {
          const { summary } = event;
          return (
            <article
              key={event.announcementId}
              className="bg-card border-border space-y-3 rounded-lg border p-4 print:break-inside-avoid"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Etkinlik</p>
                  <p className="text-foreground text-sm font-semibold">{event.title}</p>
                  <p className="text-muted-foreground text-xs">
                    Etkinlik Tarihi: <span className="text-foreground font-medium">{formatDate(event.date)}</span>
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  Öğrencinin yanıtı: <span className="text-foreground font-medium">{rsvpLabel(event.rsvp)}</span>
                </p>
              </div>

              {attendanceNote(summary) && (
                <p className="bg-muted text-foreground flex items-start gap-2 rounded-md px-3 py-2 text-sm" data-slot="attendance-note">
                  <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span>{attendanceNote(summary)}</span>
                </p>
              )}

              <ul className="space-y-1">
                {summary.sessions.map((s) => (
                  <li key={s.sessionNumber} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        s.status === "attended"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
                          : s.status === "not_attended"
                            ? "border-rose-500 bg-rose-500/15 text-rose-600"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {s.status === "attended" ? <Check className="size-3" /> : s.status === "not_attended" ? <X className="size-3" /> : <Minus className="size-3" />}
                    </span>
                    <span className="text-foreground">
                      {s.sessionNumber}. Oturum:{" "}
                      <span className={cn("font-medium", s.status === "attended" ? "text-emerald-700" : s.status === "not_attended" ? "text-rose-700" : "text-muted-foreground")}>
                        {sessionStatusLabel(s.status)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground text-xs">
                {event.sessionCount} oturumdan {summary.attended} tanesine katıldı
                {summary.unmarked > 0 && ` · ${summary.unmarked} oturumda yoklama alınmadı`}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
