"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Crown, Timer } from "lucide-react";

import { useCoachStopwatchWidgetCollapsed } from "@/lib/use-coach-stopwatch-widget-collapsed";
import { isLiveNow } from "@/lib/focus-live-status";
import { cn } from "@/lib/utils";
import { getCoachLiveFocusStatuses, type StopwatchRosterRow, type YesterdaysStopwatchWinner } from "../../actions";

const LIVE_POLL_INTERVAL_MS = 20_000;
const CLOCK_TICK_MS = 5_000;

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

// Same wording/thresholds as the admin student directory's own
// formatRelativeTime (app/admin/students/page.tsx) -- duplicated per this
// repo's per-panel convention, kept in sync deliberately so "Son görülme"
// reads identically everywhere it appears. Takes `now` (this widget's own
// ticking clock state) rather than reading Date.now() directly, so the
// label stays live without its own separate timer.
function formatLastSeen(iso: string | null, now: number): string {
  if (!iso) return "Hiç görülmedi";
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

// Fixed-right collapsible widget, same "book spine" shape as the
// announcements widget but at a distinct offset (top-[68%] vs. that
// one's top-1/2) and its own blue theme, so the two can coexist on
// /coach/dashboard without overlapping or looking identical. Its own
// pathname gate is folded in here directly, matching the student
// stopwatch widget's precedent (no popup to manage, so no separate
// "Center" wrapper is needed).
//
// Shows every one of the coach's students (not just top performers --
// unlike the student-side widget, there's no privacy constraint here,
// the coach already sees this same roster in full on /coach/stopwatch),
// sorted by today's total descending, each with a live "Çalışıyor"/
// "Boşta" indicator. The initial `roster` prop comes from the layout's
// own fetch of fetchStopwatchCompetitionRoster (already computed daily
// totals); getCoachLiveFocusStatuses is polled separately and more
// often so the live dot stays current without re-running that heavier
// aggregation every 20s.
export function StopwatchSideWidget({
  roster,
  yesterdaysWinner,
}: {
  roster: StopwatchRosterRow[];
  // "Dünün Birincisi" -- see fetchYesterdaysStopwatchWinner's own comment
  // (app/coach/actions.ts). Same amber/Crown treatment as the student
  // widget's own "Dünün Şampiyonu" block, one row above the roster list.
  yesterdaysWinner: YesterdaysStopwatchWinner;
}) {
  const pathname = usePathname();
  const { collapsed, toggle } = useCoachStopwatchWidgetCollapsed();
  const [now, setNow] = useState(() => Date.now());
  const [heartbeats, setHeartbeats] = useState<Map<string, string | null>>(
    () => new Map(roster.map((r) => [r.studentId, r.activeFocusHeartbeatAt])),
  );
  const [, startTransition] = useTransition();

  const showWidget = pathname === "/coach/dashboard" && roster.length > 0;

  useEffect(() => {
    if (!showWidget) return;
    const tickId = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const pollId = setInterval(() => {
      startTransition(async () => {
        const statuses = await getCoachLiveFocusStatuses();
        setHeartbeats(new Map(statuses.map((s) => [s.studentId, s.activeFocusHeartbeatAt])));
      });
    }, LIVE_POLL_INTERVAL_MS);
    return () => {
      clearInterval(tickId);
      clearInterval(pollId);
    };
  }, [showWidget]);

  if (!showWidget) return null;

  const rows = [...roster].sort((a, b) => b.dailyMinutes - a.dailyMinutes);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Kronometre yarışması panelini genişlet"
        className="fixed top-[68%] right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-blue-300 bg-blue-100 px-2 py-3 text-blue-800 shadow-lg transition-colors hover:bg-blue-200 dark:border-blue-700/50 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60 print:hidden"
      >
        <Timer className="size-4 shrink-0" />
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">Yarışma</span>
      </button>
    );
  }

  return (
    <div className="border-border bg-card fixed top-[68%] right-4 z-40 flex max-h-[70vh] w-72 -translate-y-1/2 flex-col rounded-lg border shadow-lg print:hidden">
      <div className="flex shrink-0 items-start justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2">
          <Timer className="size-4 shrink-0 text-blue-600" />
          <p className="text-foreground text-sm font-semibold">Kronometre Yarışması</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label="Kronometre yarışması panelini küçült"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Pinned above the scrollable roster below (not inside it) so it
          stays visible regardless of how far the coach scrolls -- unlike
          the student widget's own "Dünün Şampiyonu", which sits inside a
          short, non-scrolling list of just 2-3 rows. */}
      {yesterdaysWinner && (
        <div className="shrink-0 px-4 pb-3">
          <div className="relative overflow-hidden rounded-md border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 p-3 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-amber-900/30">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400/30">
                <Crown className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                  Dünün Birincisi
                </p>
                <p className="text-foreground truncate text-sm font-semibold">{yesterdaysWinner.fullName ?? "—"}</p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {formatMinutesLabel(yesterdaysWinner.minutes)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 space-y-1.5 overflow-y-auto px-4 pb-4">
        {rows.map((row) => {
          // Map.get returns undefined (not null) for a key the poll
          // hasn't covered yet -- `??` alone would wrongly keep an old
          // non-null roster timestamp forever once the poll confirms
          // null (session ended), since `null ?? x` evaluates to `x`.
          const heartbeatAt = heartbeats.has(row.studentId) ? (heartbeats.get(row.studentId) ?? null) : row.activeFocusHeartbeatAt;
          const live = isLiveNow(heartbeatAt, now);
          return (
            <div key={row.studentId} className="border-border flex items-center gap-2 rounded-md border p-2.5">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  live ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">{row.fullName ?? "—"}</p>
                {/* "Çalışıyor" while live already says everything "last
                    seen" would; the two only ever show one at a time so
                    this stays a single line, same row height either way. */}
                <p className={cn("truncate text-xs", live ? "text-emerald-600" : "text-muted-foreground")}>
                  {live ? "Çalışıyor" : `Son görülme: ${formatLastSeen(row.lastActiveAt, now)}`}
                </p>
              </div>
              <p className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                {formatMinutesLabel(row.dailyMinutes)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
