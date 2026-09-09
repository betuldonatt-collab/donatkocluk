"use client";

import { useState } from "react";
import { MonthCalendar } from "./month-calendar";
import { DayDetailSheet } from "./day-detail-sheet";
import { MonthlySummary } from "./monthly-summary";
import type { CoachingSession, RosterStudent } from "../../dashboard/types";

export function SessionsClient({
  grid,
  roster,
  sessions,
  todayIso,
}: {
  grid: { date: string; dayOfMonth: number; inMonth: boolean }[];
  roster: RosterStudent[];
  sessions: CoachingSession[];
  todayIso: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const sessionsByDate = new Map<string, CoachingSession[]>();
  for (const s of sessions) {
    const d = s.scheduled_at.slice(0, 10);
    sessionsByDate.set(d, [...(sessionsByDate.get(d) ?? []), s]);
  }

  return (
    <div className="space-y-6">
      <MonthCalendar grid={grid} todayIso={todayIso} sessionsByDate={sessionsByDate} onSelectDay={setSelectedDate} />
      <MonthlySummary sessions={sessions} />
      <DayDetailSheet
        date={selectedDate}
        sessions={selectedDate ? (sessionsByDate.get(selectedDate) ?? []) : []}
        roster={roster}
        open={selectedDate !== null}
        onOpenChange={(open) => !open && setSelectedDate(null)}
      />
    </div>
  );
}
