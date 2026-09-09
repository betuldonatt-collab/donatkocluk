import { LineChart } from "@/app/coach/students/[id]/_components/charts/line-chart";
import type { CoachingSession } from "../../dashboard/types";

// Completion rate is computed over *evaluated* sessions only (completed +
// not_happened) -- a still-'pending' session (future, or occurred but not
// yet evaluated by the coach) is neither a completion nor a miss, so it's
// excluded from both sides of the ratio rather than counting against the
// coach.
//
// Coach anonymity: this is the ONLY place in the coach UI a student
// rating is surfaced, and only ever as a same-day average across
// (potentially) multiple students' sessions -- never a single session's
// raw score tied to one student.
export function MonthlySummary({ sessions }: { sessions: CoachingSession[] }) {
  const evaluated = sessions.filter((s) => s.outcome === "completed" || s.outcome === "not_happened");
  const completed = sessions.filter((s) => s.outcome === "completed");
  const completionRate = evaluated.length > 0 ? Math.round((completed.length / evaluated.length) * 100) : null;

  const ratingsByDate = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.student_rating == null) continue;
    const d = s.scheduled_at.slice(0, 10);
    ratingsByDate.set(d, [...(ratingsByDate.get(d) ?? []), s.student_rating]);
  }
  const ratingTrend = [...ratingsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ratings]) => ({
      date,
      value: Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10,
    }));

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="border-border rounded-xl border p-5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Tamamlanma Oranı</p>
        <p className="text-foreground mt-1 text-3xl font-semibold">
          {completionRate === null ? "—" : `%${completionRate}`}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {evaluated.length === 0 ? "Bu ay değerlendirilen görüşme yok." : `${completed.length}/${evaluated.length} görüşme gerçekleşti`}
        </p>
      </div>
      <div className="border-border rounded-xl border p-5">
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Günlük Ortalama Öğrenci Puanı</p>
        <LineChart data={ratingTrend} unit=" ★" />
      </div>
    </div>
  );
}
