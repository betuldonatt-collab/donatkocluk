"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Crown, Timer, Trophy } from "lucide-react";

import { useStopwatchWidgetCollapsed } from "@/lib/use-stopwatch-widget-collapsed";
import { subscribeTick } from "@/lib/background-ticker";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { getRunningFocusSessions, type DailyStopwatchRanking, type RunningFocusSession } from "../../actions";

// How often this widget re-reads the student's own running/paused sessions
// while mounted -- independent of the floating focus-session widget's own
// refresh triggers, so the daily total stays current even if that widget
// isn't mounted for some reason. A paused session's contribution never
// changes on its own, so polling (rather than reacting to every click) is
// simple and "good enough": the total catches up within one interval of any
// Süre Tut / Mola Ver / Bitir, on this tab or another. The poll is a READ-ONLY
// display refresh (getRunningFocusSessions only selects): it never records
// time -- that is the floating focus widget's heartbeat and the server-side
// wall clock -- so it runs only while this tab is visible, and once the moment
// the tab comes back (nothing is on screen in a hidden tab to keep fresh).
const POLL_INTERVAL_MS = 10_000;

type LiveSession = RunningFocusSession & { fetchedAt: number };

// Not-yet-banked seconds for one session, as of `nowMs` -- frozen for a
// paused one (Mola Ver already banked its run through the moment it was
// clicked), still climbing for a running one.
function liveSeconds(session: LiveSession, nowMs: number): number {
  if (session.status === "paused") return session.elapsedSeconds;
  return session.elapsedSeconds + Math.max(0, (nowMs - session.fetchedAt) / 1000);
}

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

// Fixed-right collapsible widget, same "book spine" shape as the
// announcements widget (announcement-side-widget.tsx) but offset lower
// (top-[68%] vs. that one's top-1/2, amber instead of purple) so the two
// can coexist on /student without overlapping or looking identical. Its
// own pathname gate is folded in here directly (no separate "Center"
// wrapper needed, unlike announcements -- there's no popup dialog to
// manage alongside it).
//
// Deliberately shows only two numbers -- the #1 student's name/total and
// the caller's own rank/total -- never a full roster list. That's not a
// display choice made here; getDailyStopwatchRanking's underlying
// database function only ever returns those two data points, by design.
//
// myRank is null when a coach has set this student to "passive" (kicked
// out of the competition for stopwatch abuse, etc, see 0068_stopwatch_
// competition_groups.sql) -- they still get their own real minutes
// (myTotalMinutes), just no rank/position, so the "Senin Sıralaman" block
// below swaps to a plain "today's minutes" readout instead of a broken
// "#null / N".
export function StopwatchWidget({ ranking }: { ranking: DailyStopwatchRanking }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useStopwatchWidgetCollapsed();
  const onStudentPage = pathname === "/student";

  // Own running/paused sessions, polled independently of the floating
  // focus-session widget -- what turns `ranking.myTotalMinutes` (the
  // committed, server-aggregated figure) into a live number that already
  // includes whatever hasn't been banked to student_tasks yet, so a Mola
  // never makes today's total look like it went backwards or stalled.
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    getRunningFocusSessions()
      .then((rows) => {
        const fetchedAt = Date.now();
        setSessions(rows.map((s) => ({ ...s, fetchedAt })));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (onStudentPage) load();
  }, [onStudentPage, load]);
  useVisibleInterval(load, POLL_INTERVAL_MS, onStudentPage);

  // Ticks only while something is actually running -- a purely paused
  // contribution is frozen, so there's nothing to animate for it.
  const hasRunning = sessions.some((s) => s.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    return subscribeTick(() => setNow(Date.now()));
  }, [hasRunning]);

  if (!onStudentPage || ranking.participantCount === 0) return null;

  const liveExtraSeconds = sessions.reduce((sum, s) => sum + liveSeconds(s, now), 0);
  const myTotalMinutes = (ranking.myTotalMinutes ?? 0) + Math.floor(liveExtraSeconds / 60);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Kronometre yarışması panelini genişlet"
        className="fixed top-[68%] right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-amber-300 bg-amber-100 px-2 py-3 text-amber-800 shadow-lg transition-colors hover:bg-amber-200 dark:border-amber-700/50 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60 print:hidden"
      >
        <Timer className="size-4 shrink-0" />
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">Yarışma</span>
      </button>
    );
  }

  return (
    <div className="border-border bg-card fixed top-[68%] right-4 z-40 flex w-72 -translate-y-1/2 flex-col rounded-lg border shadow-lg print:hidden">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2">
          <Timer className="size-4 shrink-0 text-amber-600" />
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

      <div className="space-y-2 px-4 pb-4">
        {/* Dünün Şampiyonu -- only the previous logical day's (02:00
            Turkey time boundary, migration 0079) top scorer, so a student
            who fell asleep before the reset still gets to see who won
            instead of that standing just vanishing. Absent (not a 0-
            minute placeholder) whenever nobody tracked anything that day. */}
        {ranking.yesterdayWinnerName && (
          <div className="relative overflow-hidden rounded-md border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 p-3 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-amber-900/30">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400/30">
                <Crown className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                  Dünün Şampiyonu
                </p>
                <p className="text-foreground truncate text-sm font-semibold">{ranking.yesterdayWinnerName}</p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {formatMinutesLabel(ranking.yesterdayWinnerTotalMinutes ?? 0)}
              </p>
            </div>
          </div>
        )}

        <div className="border-border flex items-center gap-2 rounded-md border p-3">
          <Trophy className="size-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Bugünün Lideri</p>
            <p className="text-foreground truncate text-sm font-medium">{ranking.topStudentName}</p>
          </div>
          <p className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
            {formatMinutesLabel(ranking.topStudentTotalMinutes ?? 0)}
          </p>
        </div>

        <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border p-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              {ranking.myRank !== null ? "Senin Sıralaman" : "Bugünkü Süren"}
            </p>
            <p className="text-foreground text-sm font-medium">
              {ranking.myRank !== null ? `#${ranking.myRank} / ${ranking.participantCount}` : "Yarışma dışısın"}
            </p>
          </div>
          <p className="text-foreground shrink-0 text-sm font-semibold tabular-nums">{formatMinutesLabel(myTotalMinutes)}</p>
        </div>
        {liveExtraSeconds >= 60 && (
          <p className="text-muted-foreground px-1 text-[11px]">
            Molada/devam eden süren dahil (henüz kaydedilmemiş {Math.floor(liveExtraSeconds / 60)} dk dahil edildi).
          </p>
        )}
      </div>
    </div>
  );
}
