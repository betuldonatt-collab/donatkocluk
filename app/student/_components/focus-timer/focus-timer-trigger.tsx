"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendFocusHeartbeat, updateTaskProgress } from "../../actions";
import type { StudentTask } from "../daily-tasks/types";
import { FocusTimerModal, type FocusTimerMode } from "./focus-timer-modal";

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

// Per-task Focus Mode entry point -- opens the same fullscreen timer for
// whichever task this button is rendered next to. Every way a session can
// end -- Bitir, Vazgeç, or the modal unmounting mid-session -- logs its
// seconds onto THIS task's own tracked_duration_minutes (accumulated, since
// a student may run several sessions on the same task across visits),
// reusing the existing updateTaskProgress action. Deliberately a SEPARATE
// column from duration_minutes (a coach's target/estimated duration, or a
// student's manually-typed exam time) -- the Kronometre Yarışması
// leaderboard sums only tracked_duration_minutes, so a task merely being
// assigned a target duration must never inflate it; only genuine stopwatch
// time recorded here does (see migration 0074_stopwatch_tracked_duration).
export function FocusTimerTrigger({ task, className }: { task: StudentTask; className?: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Shared by every exit path (Bitir, Vazgeç, unmount) so all three save
  // identically -- a session with 0 seconds (e.g. Vazgeç before starting)
  // is silently skipped rather than writing a no-op update.
  async function persistSession(seconds: number) {
    if (seconds <= 0) return;
    const sessionMinutes = Math.max(1, Math.round(seconds / 60));
    const nextTotal = Math.min(1440, task.tracked_duration_minutes + sessionMinutes);
    setSaving(true);
    try {
      await updateTaskProgress(task.id, { tracked_duration_minutes: nextTotal });
      toast.success(`${formatDuration(seconds)} odaklandın, göreve kaydedildi.`);
    } catch {
      toast.error("Odak süresi kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish(result: { mode: FocusTimerMode; seconds: number }) {
    setOpen(false);
    await persistSession(result.seconds);
  }

  async function handleCancel(seconds: number) {
    setOpen(false);
    await persistSession(seconds);
  }

  // Fire-and-forget: a missed beat only leaves a coach seeing a stale
  // "Boşta" a little longer (see lib/focus-live-status.ts), never a
  // lost task update, so this deliberately doesn't toast or retry.
  function handleHeartbeat() {
    sendFocusHeartbeat().catch(() => {});
  }

  if (task.week_locked) return null;

  return (
    <>
      {/* `className` (hidden/flex responsive visibility, shrink-0) moves
          here from the Button below so the duration badge and the button
          hide/show together as one unit -- the caller in task-card.tsx
          doesn't need to change at all. */}
      <div className={cn("items-center gap-1.5", className)}>
        {!!task.tracked_duration_minutes && (
          <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
            {formatMinutesLabel(task.tracked_duration_minutes)}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(true);
          }}
          disabled={saving}
          aria-label="Odak modunu başlat"
        >
          <Timer className="size-3.5" />
          Süre Tut
        </Button>
      </div>

      {open && (
        <FocusTimerModal taskTitle={task.title} onCancel={handleCancel} onFinish={handleFinish} onHeartbeat={handleHeartbeat} />
      )}
    </>
  );
}
