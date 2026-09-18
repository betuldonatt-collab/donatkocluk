// "YKS Geri Sayım" -- a deliberately calm days-left counter, not a live
// ticking clock. Product decision: exam-countdown UI is a well-known
// anxiety trigger, so this is capped to whole days only (no hours/
// minutes/seconds), never shown to parents (only the student and coach
// sidebars mount this), and styled as a quiet pill rather than an
// alarming badge -- no red, no pulsing, no "URGENT" framing regardless of
// how few days remain.
//
// Hardcoded for now (YKS 2027) -- swap for a DB-driven date once this
// needs to survive past that exam date without a code change.
const YKS_TARGET_DATE_ISO = "2027-06-19";

// Whole days between UTC-midnight "today" and the target date -- matches
// this app's own established "today" convention (todayISO() et al.,
// plain UTC, not the stopwatch competition's deliberate Turkey-time
// shift, which exists for a different reason entirely: a fair 02:00
// daily-reset boundary for live tracked time, not a slow-moving date-only
// count like this one). Both operands are already whole UTC days, so this
// divides out to an exact integer with no rounding ambiguity.
function daysUntilYks(): number {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const target = new Date(`${YKS_TARGET_DATE_ISO}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// "student": "🎯 YKS'ye 284 Gün". "coach": "🎯 YKS: 284 Gün (40 Hafta)" --
// the extra week count is genuinely useful for a coach planning multi-week
// programs, not just decoration, so it's the one difference between the
// two variants rather than a generic suffix bolted onto both.
export function YksCountdown({ variant }: { variant: "student" | "coach" }) {
  const daysLeft = daysUntilYks();
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
          YKS&apos;ye <span className="font-semibold">{daysLeft}</span> Gün
        </span>
      ) : (
        <span>
          YKS: <span className="font-semibold">{daysLeft}</span> Gün ({weeksLeft} Hafta)
        </span>
      )}
    </div>
  );
}
