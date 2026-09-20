"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import {
  endFocusSession,
  getActiveFocusSession,
  heartbeatFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  sendFocusHeartbeat,
  startFocusSession,
} from "../../actions";
import type { StudentTask } from "../daily-tasks/types";
import { FocusTimerModal, type ActiveFocusSession, type FocusTimerMode } from "./focus-timer-modal";

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
// whichever task this button is rendered next to. Persistence is entirely
// server-authoritative now (migration 0078, app/student/actions.ts): a
// focus_sessions row tracks the live/paused state of a session by task id,
// resumable from any device, and reconciled via wall-clock math against a
// last_heartbeat_at trust boundary rather than anything this component
// computes itself. This component's job is just wiring the modal's UI
// events to the right server action and keeping the "Süre Tut" button's own
// cumulative badge (task.tracked_duration_minutes) in view.
export function FocusTimerTrigger({ task, className }: { task: StudentTask; className?: string }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [initialSession, setInitialSession] = useState<ActiveFocusSession | null>(null);

  // Resolves whether there's a resumable session BEFORE the modal ever
  // mounts, so it can go straight to the "Devam eden bir seansın var..."
  // prompt instead of flashing the normal picker first. A failure here
  // just falls back to the normal picker (harmless -- if a resumable
  // session genuinely exists, it's still sitting on the server and will be
  // banked, not lost, whenever it's next reconciled).
  async function handleOpen() {
    setChecking(true);
    try {
      const session = await getActiveFocusSession(task.id);
      setInitialSession(session);
    } catch {
      setInitialSession(null);
    } finally {
      setChecking(false);
      setOpen(true);
    }
  }

  async function handleFinish(result: { mode: FocusTimerMode; seconds: number; creditedSeconds?: number }) {
    setOpen(false);
    try {
      // creditedSeconds is only set when the student shortened the figure
      // from the "Hâlâ çalışmaya devam ediyor musun?" check-in.
      const ended = await endFocusSession(task.id, result.creditedSeconds);
      if (!ended.ok) {
        toast.error(ended.error);
        return;
      }
      clearConfirmedMultiple(task.id);
      if (ended.pendingApproval) {
        toast.warning(`${formatDuration(result.seconds)} çok uzun olduğu için koç onayına gönderildi.`);
      } else if (result.seconds > 0) {
        toast.success(`${formatDuration(result.seconds)} odaklandın, göreve kaydedildi.`);
      }
    } catch {
      toast.error("Odak süresi kaydedilemedi, tekrar dene.");
    }
  }

  async function handleCancel(seconds: number) {
    setOpen(false);
    try {
      const ended = await endFocusSession(task.id);
      if (!ended.ok) {
        toast.error(ended.error);
        return;
      }
      clearConfirmedMultiple(task.id);
      if (ended.pendingApproval) {
        toast.warning(`${formatDuration(seconds)} çok uzun olduğu için koç onayına gönderildi.`);
      } else if (seconds > 0) {
        toast.success(`${formatDuration(seconds)} odaklandın, göreve kaydedildi.`);
      }
    } catch {
      toast.error("Odak süresi kaydedilemedi, tekrar dene.");
    }
  }

  // "Arka planda çalışsın": close the fullscreen timer WITHOUT ending anything.
  // The session keeps running on the server and the floating widget
  // (active-focus-session-widget.tsx) picks it up on every page.
  function handleMinimize() {
    setOpen(false);
    toast.success("Sayaç arka planda çalışıyor. Sağ alttaki karttan Mola verebilir, Bitirebilir ya da ayrı pencerede açabilirsin.");
  }

  function handleStart(mode: FocusTimerMode, countdownTargetSeconds: number | null) {
    startFocusSession(task.id, mode, countdownTargetSeconds).catch(() => {
      toast.error("Süre senkronize edilemedi ama sayaç çalışmaya devam ediyor.");
    });
  }

  function handlePause() {
    pauseFocusSession(task.id).catch(() => {});
  }

  function handleResumeSession() {
    return resumeFocusSession(task.id);
  }

  // Fire-and-forget: a missed beat only leaves a coach seeing a stale
  // "Boşta" a little longer, or widens the dead-air window a later
  // reconciliation has to assume didn't happen -- never a lost task
  // update, so this deliberately doesn't toast or retry.
  function handleHeartbeat() {
    sendFocusHeartbeat().catch(() => {});
    heartbeatFocusSession(task.id).catch(() => {});
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
            handleOpen();
          }}
          disabled={checking}
          aria-label="Odak modunu başlat"
        >
          <Timer className="size-3.5" />
          Süre Tut
        </Button>
      </div>

      {open && (
        <FocusTimerModal
          taskId={task.id}
          taskTitle={task.title}
          initialSession={initialSession}
          onStart={handleStart}
          onPause={handlePause}
          onResumeSession={handleResumeSession}
          onCancel={handleCancel}
          onMinimize={handleMinimize}
          onFinish={handleFinish}
          onHeartbeat={handleHeartbeat}
        />
      )}
    </>
  );
}
