"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, PartyPopper, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FocusTimerBackground, randomFocusTimerAnimationIndex } from "./focus-timer-animations";

export type FocusTimerMode = "stopwatch" | "countdown";

const COUNTDOWN_PRESETS_MIN = [15, 25, 45, 60];
const SUCCESS_DISPLAY_MS = 1400;
const HEARTBEAT_INTERVAL_MS = 20_000;

function formatSeconds(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Tiered praise for the success screen -- picked once when the session
// finishes (see resolvePraiseMessage below), not re-picked while the
// success screen is showing.
const GOAL_HIT_MESSAGES = [
  "Hedefi 12'den vurdun! Planladığın süreyi kusursuz tamamladın.",
  "Tam vaktinde! Hedefine birebir ulaştın.",
];
const SHORT_SESSION_MESSAGES = ["Güzel bir ısınma turu!", "Küçük adımlar büyük işler başarır!"];
const STANDARD_SESSION_MESSAGES = ["Harika bir odak bloğu!", "Zihni kilitledin, süper gidiyorsun!"];
const LONG_SESSION_MESSAGES = ["Gerçek bir maraton disiplini!", "Bugün rakiplerine fark attın!"];

function pickRandom(pool: string[]) {
  return pool[Math.floor(Math.random() * pool.length)];
}

// A completed countdown goal always gets its own celebration, regardless
// of how long the planned duration was -- hitting a 15-minute target is
// just as much "nailed it" as hitting a 60-minute one. Everything else
// (stopwatch sessions, and a countdown ended early via Bitir before time
// was up) falls back to the duration-based tiers.
function resolvePraiseMessage(finishing: { seconds: number; goalHit: boolean }): string {
  if (finishing.goalHit) return pickRandom(GOAL_HIT_MESSAGES);
  const minutes = finishing.seconds / 60;
  if (minutes < 20) return pickRandom(SHORT_SESSION_MESSAGES);
  if (minutes < 50) return pickRandom(STANDARD_SESSION_MESSAGES);
  return pickRandom(LONG_SESSION_MESSAGES);
}

// Full-viewport, backdrop-blurred overlay -- deliberately not dismissible
// by clicking outside or Escape, since the point of Focus Mode is to
// prevent the student from wandering off without at least pausing or
// finishing. "Vazgeç" is the one explicit escape hatch, kept small and
// separate from Mola Ver / Bitir so it's never an accidental click.
export function FocusTimerModal({
  taskTitle,
  onCancel,
  onFinish,
  onHeartbeat,
}: {
  taskTitle: string;
  // Called on "Vazgeç" or an unexpected unmount -- with however many
  // seconds had accumulated at that point (0 if the session never
  // started), so the trigger can persist a session even when it wasn't
  // finished through the normal Bitir flow.
  onCancel: (seconds: number) => void;
  onFinish: (result: { mode: FocusTimerMode; seconds: number }) => void;
  // Fired immediately whenever the timer starts/resumes, then every
  // HEARTBEAT_INTERVAL_MS while it keeps running -- see the effect
  // below. Optional so this modal doesn't hard-depend on the server
  // action living in the trigger.
  onHeartbeat?: () => void;
}) {
  const [mode, setMode] = useState<FocusTimerMode>("stopwatch");
  const [started, setStarted] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishing, setFinishing] = useState<{ mode: FocusTimerMode; seconds: number; goalHit: boolean } | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Picked once per mount -- since the parent only mounts this modal while
  // it's open, every fresh "open" gets its own random pick.
  const backgroundIndex = useMemo(() => randomFocusTimerAnimationIndex(), []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startedAtRef.current !== null) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  // "Anlık Çalışma Durumu" -- a coach-visible live indicator. Fires once
  // right away whenever `running` flips true (start or resume from a
  // break) so the coach sees the student go live within ~1s rather than
  // waiting a full interval, then every HEARTBEAT_INTERVAL_MS after
  // that. Pausing (Mola Ver) or finishing simply stops this effect --
  // no explicit "clear" call, since the coach side treats a heartbeat
  // older than LIVE_STATUS_STALE_MS as idle regardless (see
  // lib/focus-live-status.ts).
  useEffect(() => {
    if (!running) return;
    onHeartbeat?.();
    const id = setInterval(() => onHeartbeat?.(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Mirrors the latest started/elapsed/finishing state after every render
  // so the unmount cleanup below (a closure fixed at effect-setup time)
  // can still read live values instead of the ones from its first render.
  const liveRef = useRef({ started, elapsedMs, finishing });
  useEffect(() => {
    liveRef.current = { started, elapsedMs, finishing };
  });

  // Guards against reporting a session's elapsed time more than once --
  // "Vazgeç" and the unmount cleanup below can both fire for the same
  // close (a Vazgeç click leads straight to the parent unmounting this
  // modal), and without this guard that would double-count the minutes
  // when the trigger adds them cumulatively onto the task.
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!finishing) return;
    const id = setTimeout(() => {
      reportedRef.current = true;
      onFinish({ mode: finishing.mode, seconds: finishing.seconds });
    }, SUCCESS_DISPLAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing]);

  // Safety net for closing this modal any way other than the normal Bitir
  // flow above (Vazgeç, or the whole task board unmounting mid-session,
  // e.g. the student navigating away) -- reports whatever had accumulated
  // so far instead of silently losing it. If Bitir's own timeout already
  // claimed the report (or already fired), this is a no-op; if that timeout
  // gets cut short by this very unmount, `finishing.seconds` (captured
  // before the countdown to onFinish) is used as the fallback amount.
  //
  // The report itself is deferred by one tick (setTimeout(..., 0)) rather
  // than called straight from the cleanup, and any pending one is cancelled
  // at the top of the very next setup -- React Strict Mode (on by default
  // for the app router since Next 13.5.1, see next.config.ts) deliberately
  // mounts every component, cleans it up, then mounts it again to prove
  // cleanups are safe to run without lasting effect. Calling onCancel(0)
  // straight from a bare cleanup fires on that simulated cleanup too,
  // which calls setOpen(false) in the trigger and closes the modal the
  // instant it opens. Deferring it means the immediate Strict Mode
  // remount's setup runs first (in the same tick) and cancels it before
  // it can ever fire; only a cleanup with no following remount -- a real
  // unmount -- lets the deferred report actually go through.
  const pendingUnmountReportRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingUnmountReportRef.current !== null) {
      clearTimeout(pendingUnmountReportRef.current);
      pendingUnmountReportRef.current = null;
    }
    return () => {
      pendingUnmountReportRef.current = setTimeout(() => {
        pendingUnmountReportRef.current = null;
        if (reportedRef.current) return;
        reportedRef.current = true;
        const { started, elapsedMs, finishing } = liveRef.current;
        const seconds = finishing ? finishing.seconds : started ? Math.round(elapsedMs / 1000) : 0;
        onCancel(seconds);
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picked once when the session actually finishes, not re-rolled while
  // the success screen is showing.
  const praiseMessage = useMemo(() => (finishing ? resolvePraiseMessage(finishing) : ""), [finishing]);

  const totalSeconds = mode === "countdown" ? countdownMinutes * 60 : 0;
  const elapsedSeconds = elapsedMs / 1000;
  const displaySeconds = mode === "countdown" ? Math.max(0, totalSeconds - elapsedSeconds) : elapsedSeconds;
  const countdownDone = mode === "countdown" && elapsedSeconds >= totalSeconds;

  function handleStart() {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStarted(true);
    setRunning(true);
  }

  function handleTakeBreak() {
    setRunning(false);
    setOnBreak(true);
    startedAtRef.current = null;
  }

  function handleResume() {
    setOnBreak(false);
    startedAtRef.current = Date.now() - elapsedMs;
    setRunning(true);
  }

  function handleFinish() {
    setRunning(false);
    // A countdown ended early via Bitir (before its target was reached)
    // doesn't count as "hitting the goal" -- only countdownDone does.
    setFinishing({ mode, seconds: Math.round(elapsedSeconds), goalHit: countdownDone });
  }

  // The explicit "Vazgeç" click -- reports whatever's accumulated so far
  // (0 if the session never started) before closing, then lets the
  // reportedRef guard above no-op the unmount cleanup that follows it.
  function handleCancelClick() {
    reportedRef.current = true;
    onCancel(started ? Math.round(elapsedMs / 1000) : 0);
  }

  function handleCustomMinutesChange(value: string) {
    setCustomMinutes(value);
    const parsed = Number(value);
    if (value.trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
      setCountdownMinutes(Math.min(180, Math.round(parsed)));
    }
  }

  // Rendered inline (not a portal) inside FocusTimerTrigger, which itself
  // sits inside TaskCard's clickable row -- without this, every click (and
  // Enter/Space keypress) on a button in here would bubble past the modal
  // and also fire the task card's own onClick, popping the task's
  // completion modal open behind/underneath this one.
  //
  // preventDefault only goes on the click guard -- every button in this
  // modal is type="button" with no default browser action worth blocking,
  // so it's a safe no-op there. It must NOT go on the keydown guard: the
  // "özel süre" number input relies on default keydown behavior for
  // digits/backspace/arrow-spinners, and preventDefault-ing every keydown
  // that bubbles through this div would silently break typing into it.
  function stopClickBubbling(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }
  function stopKeyBubbling(e: React.KeyboardEvent) {
    e.stopPropagation();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/70 p-6 backdrop-blur-md"
      onClick={stopClickBubbling}
      onKeyDown={stopKeyBubbling}
    >
      <FocusTimerBackground index={backgroundIndex} />

      {/* Hidden once the celebration screen is showing -- Bitir's own
          save is already underway at that point, and there's nothing
          left to meaningfully "cancel". */}
      {!finishing && (
        <button
          type="button"
          onClick={handleCancelClick}
          className="text-muted-foreground hover:text-foreground absolute top-6 right-6 z-10 text-xs font-medium underline-offset-2 hover:underline"
        >
          Vazgeç
        </button>
      )}

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
        {finishing ? (
          <>
            <div className="bg-emerald-500/15 flex size-20 items-center justify-center rounded-full">
              <PartyPopper className="size-10 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-foreground text-xl font-semibold">{praiseMessage}</h2>
              <p className="text-muted-foreground text-sm">
                {formatSeconds(finishing.seconds)} boyunca odaklandın. Bu süre göreve kaydedildi.
              </p>
            </div>
          </>
        ) : !started ? (
          <>
            <div className="space-y-1">
              <h2 className="text-foreground text-xl font-semibold">Odak Modu</h2>
              <p className="text-muted-foreground max-w-[260px] truncate text-sm" title={taskTitle}>
                {taskTitle}
              </p>
            </div>
            <div className="bg-secondary inline-flex rounded-lg p-1">
              {(
                [
                  { value: "stopwatch", label: "Kronometre" },
                  { value: "countdown", label: "Geri Sayım" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    mode === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {mode === "countdown" && (
              <div className="w-full space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {COUNTDOWN_PRESETS_MIN.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => {
                        setCountdownMinutes(min);
                        setCustomMinutes("");
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        countdownMinutes === min && customMinutes.trim() === ""
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {min} dk
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Label htmlFor="focus-timer-custom-minutes" className="text-muted-foreground text-xs">
                    veya özel süre
                  </Label>
                  <Input
                    id="focus-timer-custom-minutes"
                    type="number"
                    min={1}
                    max={180}
                    placeholder="dk"
                    value={customMinutes}
                    onChange={(e) => handleCustomMinutesChange(e.target.value)}
                    className="bg-background h-8 w-20 text-center"
                  />
                </div>
              </div>
            )}

            <Button type="button" size="lg" onClick={handleStart}>
              <Play className="size-4" />
              Başlat
            </Button>
          </>
        ) : onBreak ? (
          <>
            <div className="bg-amber-500/15 flex size-16 items-center justify-center rounded-full">
              <Coffee className="size-8 text-amber-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-foreground text-lg font-semibold">Mola zamanı</h2>
              <p className="text-muted-foreground text-sm">Biraz nefes al, gerinme yap. Hazır olduğunda devam edebilirsin.</p>
            </div>
            <p className="text-muted-foreground text-3xl font-bold tabular-nums">{formatSeconds(displaySeconds)}</p>
            <Button type="button" size="lg" onClick={handleResume}>
              <Play className="size-4" />
              Devam Et
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground max-w-[260px] truncate text-xs" title={taskTitle}>
              {taskTitle}
            </p>
            <p className={cn("text-foreground text-7xl font-bold tabular-nums", countdownDone && "text-emerald-500")}>
              {formatSeconds(displaySeconds)}
            </p>
            <p className="text-muted-foreground text-sm">
              {mode === "countdown" ? (countdownDone ? "Süre doldu" : "Geri Sayım") : "Kronometre"}
            </p>

            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="lg" onClick={handleTakeBreak}>
                <Pause className="size-4" />
                Mola Ver
              </Button>
              <Button type="button" size="lg" onClick={handleFinish}>
                Bitir
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
