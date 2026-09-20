"use client";

import { useState } from "react";

import { AlertPanel } from "./_components/alert-panel";
import { DailyChecklist } from "./_components/daily-checklist";
import { MeetingBanner } from "./_components/meeting-banner";
import { WeeklyCalendar } from "./_components/weekly-calendar";
import type { CalendarBlock, CoachAlerts, CoachingSession, CoachTask, RosterStudent } from "./types";
import type { PendingFocusReview, PendingStudentTask } from "../actions";

export function DashboardClient({
  today,
  weekDays,
  roster,
  bannerSession,
  weekSessions,
  weekBlocks,
  weekTasks,
  alerts,
  pendingApprovals,
  focusReviews,
}: {
  today: string;
  weekDays: { date: string; label: string }[];
  roster: RosterStudent[];
  bannerSession: CoachingSession | null;
  weekSessions: CoachingSession[];
  weekBlocks: CalendarBlock[];
  weekTasks: CoachTask[];
  alerts: CoachAlerts;
  pendingApprovals: (PendingStudentTask & { studentId: string; studentName: string | null })[];
  focusReviews: PendingFocusReview[];
}) {
  const [banner, setBanner] = useState(bannerSession);
  const [sessions, setSessions] = useState(weekSessions);
  const [blocks, setBlocks] = useState(weekBlocks);
  const [tasks, setTasks] = useState(weekTasks);

  function handleEvaluated(updated: CoachingSession, newTasks?: CoachTask[]) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setBanner((prev) => (prev?.id === updated.id ? null : prev));
    if (newTasks && newTasks.length > 0) {
      setTasks((prev) => [...prev, ...newTasks]);
    }
  }

  function handleCreatedSession(session: CoachingSession) {
    setSessions((prev) => [...prev, session]);
    setBanner((prev) => {
      if (!prev) return session;
      return new Date(session.scheduled_at) < new Date(prev.scheduled_at) ? session : prev;
    });
  }

  function handleDeletedSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setBanner((prev) => (prev?.id === id ? null : prev));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground mb-3 text-base font-semibold">Kuşbakışı</h2>
        <AlertPanel alerts={alerts} pendingApprovals={pendingApprovals} focusReviews={focusReviews} />
      </div>

      <MeetingBanner session={banner} roster={roster} onEvaluated={handleEvaluated} />

      <div>
        <h2 className="text-foreground mb-3 text-base font-semibold">Haftalık Takvim</h2>
        <WeeklyCalendar
          weekDays={weekDays}
          today={today}
          sessions={sessions}
          blocks={blocks}
          roster={roster}
          onCreatedSession={handleCreatedSession}
          onCreatedBlock={(block) => setBlocks((prev) => [...prev, block])}
          onDeletedSession={handleDeletedSession}
          onUpdatedSession={handleEvaluated}
          onDeletedBlock={(id) => setBlocks((prev) => prev.filter((b) => b.id !== id))}
        />
      </div>

      <div>
        <h2 className="text-foreground mb-3 text-base font-semibold">Günlük Görev Listesi</h2>
        <DailyChecklist
          weekDays={weekDays}
          today={today}
          tasks={tasks}
          roster={roster}
          onTasksChange={(updater) => setTasks(updater)}
        />
      </div>
    </div>
  );
}
