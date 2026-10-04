"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { markKeepRunning, markOwner, needsOtherDeviceQuestion } from "@/lib/focus-device";
import { runEndFlow } from "@/lib/focus-end-flow";
import {
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
import { OtherDeviceSessionPrompt } from "./other-device-session-prompt";

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
  // A session running on a DIFFERENT device (one this browser did not start):
  // the student is asked what to do with it before the timer opens.
  const [elsewhere, setElsewhere] = useState<AttachedFocusSession | null>(null);
  // What the fullscreen timer's stopwatch display should count UP FROM --
  // seconds already banked on this task from earlier, already-ended
  // sessions, so a student who took a Mola and comes back sees the clock
  // continue instead of restarting at 0. Seeded from the task's own
  // (already-fresh, nothing pending) cumulative total; openFocusSessionForTask
  // overrides it below with its own, just-updated figure whenever this
  // specific call changed it (banking a leftover session). Never itself
  // credited again -- only the NEW session's own elapsed is banked when it
  // ends, so there's no double count.
  //
  // Reads tracked_duration_seconds directly, NOT tracked_duration_minutes * 60
  // -- the minutes column is a generated (floor-division) column, so a task
  // sitting at 34:31 would seed this at 34:00, losing up to 59 real seconds
  // every time the server round-trip below doesn't end up overriding it
  // (e.g. openFocusSessionForTask returning "none" -- no leftover session
  // row at all, the ordinary case right after a Bitir -- which this
  // component doesn't otherwise touch this state for).
  const [priorTrackedSeconds, setPriorTrackedSeconds] = useState(() => task.tracked_duration_seconds ?? 0);

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
    let openAfter = true;
    setPriorTrackedSeconds(task.tracked_duration_seconds ?? 0);
    try {
      const result = await openFocusSessionForTask(task.id);
      if (result.kind === "attach") {
        const attached = {
          mode: result.mode,
          countdownTargetSeconds: result.countdownTargetSeconds,
          elapsedSeconds: result.elapsedSeconds,
        };
        setAttachSession(attached);
        setPriorTrackedSeconds(result.priorTrackedSeconds);
        if (needsOtherDeviceQuestion(task.id)) {
          // Don't open the timer yet -- ask first (see OtherDeviceSessionPrompt).
          setElsewhere(attached);
          openAfter = false;
        }
      } else if (result.kind === "banked") {
        clearConfirmedMultiple(task.id);
        if (result.seconds > 0) setBankedNotice({ seconds: result.seconds, pendingApproval: result.pendingApproval });
        setPriorTrackedSeconds(result.priorTrackedSeconds);
      } else if (result.kind === "error") {
        toast.error(result.error);
      }
    } catch {
      // Fall through: open the timer regardless.
    } finally {
      setChecking(false);
      if (openAfter) setOpen(true);
    }
  }

  // Bitir is OPTIMISTIC: the timer closes the instant it's clicked and the save
  // finishes in the background (lib/focus-end-flow.ts: 15 s timeout, two
  // automatic retries, a loud red "Tekrar dene" state if it still fails, and a
  // message built from what the server really banked).
  function handleFinish(result: { mode: FocusTimerMode; seconds: number; goalHit: boolean; creditedSeconds?: number }) {
    setOpen(false);
    runEndFlow({
      taskId: task.id,
      clientSeconds: result.seconds,
      creditedSeconds: result.creditedSeconds,
      goalHit: result.goalHit,
    });
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
    markOwner(task.id);
    startFocusSession(task.id, mode, countdownTargetSeconds).catch(() => {
      toast.error("Süre senkronize edilemedi ama sayaç çalışmaya devam ediyor.");
    });
  }

  function handlePause() {
    pauseFocusSession(task.id).catch(() => {});
  }

  function handleResumeSession() {
    markOwner(task.id);
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
          here from the Button below so the caller in task-card.tsx doesn't
          need to change at all. The tracked-time readout that used to sit
          here moved onto the card itself (task-card.tsx's own title-row
          badge) -- that one stays visible once the task is done, when this
          whole component unmounts, so showing it here too was redundant
          for exactly the tasks where seeing it matters least. */}
      <div className={cn("items-center gap-1.5", className)}>
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

      {elsewhere && (
        <OtherDeviceSessionPrompt
          taskTitle={task.title}
          elapsedSeconds={elsewhere.elapsedSeconds}
          onStop={() => {
            const seconds = elsewhere.elapsedSeconds;
            setElsewhere(null);
            setAttachSession(null);
            runEndFlow({ taskId: task.id, clientSeconds: seconds, goalHit: false });
          }}
          onKeep={() => {
            markKeepRunning(task.id);
            setElsewhere(null);
            setOpen(true);
          }}
        />
      )}

      {open && (
        <FocusTimerModal
          taskId={task.id}
          taskTitle={task.title}
          attachSession={attachSession}
          bankedNotice={bankedNotice}
          priorTrackedSeconds={priorTrackedSeconds}
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
