"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { focusEndingStore } from "@/lib/focus-modal-store";
import { resolvePraiseMessage } from "@/lib/focus-praise";
import { formatTimerClock } from "@/lib/focus-title";
import {
  endFocusSession,
  heartbeatFocusSession,
  openFocusSessionForTask,
  pauseFocusSession,
  resumeFocusSession,
  sendFocusHeartbeat,
  startFocusSession,
} from "../../actions";
import type { StudentTask } from "../daily-tasks/types";
import {
  FocusTimerModal,
  type AttachedFocusSession,
  type BankedNotice,
  type CloseState,
  type FocusTimerMode,
} from "./focus-timer-modal";

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

// Per-task Focus Mode entry point -- opens the same fullscreen timer for
// whichever task this button is rendered next to. Persistence is entirely
// server-authoritative (migration 0078/0086, app/student/actions.ts): a
// focus_sessions row tracks the live/paused state of a session by task id,
// worked out from wall-clock timestamps, so it survives tab switches, other
// pages and a closed tab. This component's job is wiring the modal's UI events
// to the right server action and keeping the "Süre Tut" button's own
// cumulative badge (task.tracked_duration_minutes) in view.
export function FocusTimerTrigger({ task, className }: { task: StudentTask; className?: string }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attachSession, setAttachSession] = useState<AttachedFocusSession | null>(null);
  const [bankedNotice, setBankedNotice] = useState<BankedNotice | null>(null);

  // Pressing Süre Tut asks the server what to do with any leftover session --
  // there is no "resume?" question (see openFocusSessionForTask):
  //   * a leftover paused / abandoned session is closed out on the spot and the
  //     student is told, inside the timer, how much time was logged;
  //   * a session that is alive right now is simply shown, already running.
  // A failure never blocks the student: the timer opens anyway (starting a new
  // one banks whatever was there, so nothing is lost).
  async function handleOpen() {
    setChecking(true);
    setAttachSession(null);
    setBankedNotice(null);
    try {
      const result = await openFocusSessionForTask(task.id);
      if (result.kind === "attach") {
        setAttachSession({
          mode: result.mode,
          countdownTargetSeconds: result.countdownTargetSeconds,
          elapsedSeconds: result.elapsedSeconds,
        });
      } else if (result.kind === "banked") {
        clearConfirmedMultiple(task.id);
        if (result.seconds > 0) setBankedNotice({ seconds: result.seconds, pendingApproval: result.pendingApproval });
      } else if (result.kind === "error") {
        toast.error(result.error);
      }
    } catch {
      // Fall through: open the timer regardless.
    } finally {
      setChecking(false);
      setOpen(true);
    }
  }

  // Bitir is OPTIMISTIC: the timer closes the instant it's clicked and the save
  // finishes in the background, with a "Süren kaydediliyor…" toast that turns
  // into the result. While it's in flight the floating widget hides this
  // session (focusEndingStore); if the save fails the session is still running
  // on the server, so it reappears there and can be ended again.
  function handleFinish(result: { mode: FocusTimerMode; seconds: number; goalHit: boolean; creditedSeconds?: number }) {
    setOpen(false);
    focusEndingStore.begin(task.id);
    const toastId = toast.loading("Süren kaydediliyor…");

    endFocusSession(task.id, result.creditedSeconds)
      .then((ended) => {
        if (!ended.ok) {
          toast.error(ended.error, { id: toastId });
          return;
        }
        clearConfirmedMultiple(task.id);
        const clock = formatTimerClock(result.seconds);
        if (ended.pendingApproval) {
          toast.warning(`${clock} çok uzun olduğu için koç onayına gönderildi.`, { id: toastId });
        } else if (result.seconds > 0) {
          toast.success(
            `${resolvePraiseMessage(result.seconds, result.goalHit)} ${clock} boyunca odaklandın, göreve kaydedildi.`,
            { id: toastId },
          );
        } else {
          toast.dismiss(toastId);
        }
      })
      .catch(() => toast.error("Odak süresi kaydedilemedi, tekrar dene.", { id: toastId }))
      .finally(() => focusEndingStore.end(task.id));
  }

  // The X / Escape / the green button. Closing NEVER discards time: a running
  // session carries on in the floating widget; a paused one is saved the next
  // time Süre Tut is pressed on this task.
  function handleClose(state: CloseState) {
    setOpen(false);
    if (state === "running") {
      toast.success("Sayaç arka planda çalışıyor. Sağ alttaki karttan Mola verebilir, Bitirebilir ya da ayrı pencerede açabilirsin.");
    } else if (state === "paused") {
      toast.info("Moladasın. Süre Tut'a tekrar bastığında o ana kadarki süren otomatik kaydedilir.");
    }
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

  // Fire-and-forget: a missed beat only leaves a coach seeing a stale "Boşta"
  // a little longer -- never a lost task update, so no toast or retry.
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
          attachSession={attachSession}
          bankedNotice={bankedNotice}
          onStart={handleStart}
          onPause={handlePause}
          onResumeSession={handleResumeSession}
          onClose={handleClose}
          onFinish={handleFinish}
          onHeartbeat={handleHeartbeat}
        />
      )}
    </>
  );
}
