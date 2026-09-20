// "Geri Sayım" -- a deliberately calm days-left counter, not a live
// ticking clock. Product decision: exam-countdown UI is a well-known
// anxiety trigger, so this is capped to whole days only (no hours/
// minutes/seconds), never shown to parents (only the student and coach
// sidebars mount this), and styled as a quiet pill rather than an
// alarming badge -- no red, no pulsing, no "URGENT" framing regardless of
// how few days remain.
//
// Hardcoded for now (YKS 2027 / LGS 2027) -- swap for a DB-driven date
// once either needs to survive past its exam date without a code change.
const TARGET_DATE_ISO: Record<"YKS" | "LGS", string> = {
  YKS: "2027-06-19",
  LGS: "2027-06-06",
};

// Whole days between UTC-midnight "today" and the target date -- matches
// this app's own established "today" convention (todayISO() et al.,
// plain UTC, not the stopwatch competition's deliberate Turkey-time
// shift, which exists for a different reason entirely: a fair 02:00
// daily-reset boundary for live tracked time, not a slow-moving date-only
// count like this one). Both operands are already whole UTC days, so this
// divides out to an exact integer with no rounding ambiguity.
function daysUntilExam(examType: "YKS" | "LGS"): number {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const target = new Date(`${TARGET_DATE_ISO[examType]}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// "student": "🎯 YKS'ye 284 Gün". "coach": "🎯 YKS: 284 Gün (40 Hafta)" --
// the extra week count is genuinely useful for a coach planning multi-week
// programs, not just decoration, so it's the one difference between the
// two variants rather than a generic suffix bolted onto both.
//
// examType defaults to YKS: the coach sidebar mounts this panel-wide (a
// coach's roster can mix both cohorts, so there's no single "which exam"
// to show there) -- only the student sidebar, which knows its own
// viewer's cohort, passes an explicit value.
export function YksCountdown({ variant, examType = "YKS" }: { variant: "student" | "coach"; examType?: "YKS" | "LGS" }) {
  const daysLeft = daysUntilExam(examType);
  // Renders nothing once the target date has passed -- a negative "days
  // left" would read as broken (or worse, alarming) rather than simply
  // being the wrong question to ask anymore.
  if (daysLeft < 0) return null;

  const weeksLeft = Math.floor(daysLeft / 7);

  return (
    <div className="bg-primary-foreground/10 text-primary-foreground/80 mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
      <span aria-hidden>🎯</span>
      {variant === "student" ? (
        <span>
          {examType}&apos;ye <span className="font-semibold">{daysLeft}</span> Gün
        </span>
      ) : (
        <span>
          {examType}: <span className="font-semibold">{daysLeft}</span> Gün ({weeksLeft} Hafta)
        </span>
      )}
    </div>
  );
}
