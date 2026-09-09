export type WeekStat = { total: number };

// Weekly-only, sourced from student_daily_stats (student_daily_stats_parent_read,
// 0035). Softened per product decision: shows only the total questions
// solved this week -- no Doğru/Yanlış/Boş breakdown. The student/coach
// panels' own copies of this card intentionally keep that breakdown
// (it's useful there); the parent view is meant to convey "how much
// practice happened" without raw performance numbers that could read as
// anxiety-inducing (a Yanlış/Boş count, even summed over a week, is
// still a performance metric, not just an activity signal).
export function WeeklyStatsSummary({ stat }: { stat: WeekStat }) {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center gap-1 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Bu Hafta Toplam Çözülen Soru</p>
      <p className="text-foreground text-3xl font-bold tabular-nums">{stat.total}</p>
    </div>
  );
}
