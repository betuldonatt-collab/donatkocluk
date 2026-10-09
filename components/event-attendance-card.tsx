import { AlertTriangle, Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { rsvpLabel, sessionStatusLabel, type ParentEventAttendance } from "@/lib/event-attendance";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// The "Etkinlik Katılımı" section of a report card -- the SAME section on the parent's, the student's and the coach's view: for every event of the period the coach took attendance for, the
// session-by-session roll call ("1. Oturum: Katıldı, 2. Oturum: Katılmadı") next to what the student said in the RSVP -- and a red
// warning when they said they would come and did not (a milder amber one when they missed only some sessions).
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
              className={cn(
                "bg-card space-y-3 rounded-lg border p-4 print:break-inside-avoid",
                summary.noShow ? "border-rose-400" : "border-border",
              )}
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

              {summary.noShow && (
                <div role="alert" className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>Katılacağını belirtti ancak katılmadı.</span>
                </div>
              )}
              {summary.partialAbsence && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Katılacağını belirtti ancak {summary.absent} oturuma katılmadı.
                  </span>
                </div>
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
