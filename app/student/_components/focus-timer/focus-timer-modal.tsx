"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Coffee, History, Minimize2, PartyPopper, Pause, PictureInPicture2, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { subscribeTick } from "@/lib/background-ticker";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { closePip, isPipSupported, openPip, pipStore } from "@/lib/focus-pip";
import { formatTimerTitle, setTimerTitle } from "@/lib/focus-title";
import { needsCoachApproval } from "@/lib/focus-approval";
import { focusModalStore } from "@/lib/focus-modal-store";
import { FocusTimerBackground, randomFocusTimerAnimationIndex } from "./focus-timer-animations";
import { StillStudyingPrompt, useStillStudyingPrompt } from "./still-studying-prompt";

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
export type ActiveFocusSession = {
  mode: FocusTimerMode;
  countdownTargetSeconds: number | null;
  status: "running" | "paused";
  elapsedSeconds: number;
};

export function FocusTimerModal({
  taskId,
  taskTitle,
  initialSession,
  onStart,
  onPause,
  onResumeSession,
  onCancel,
  onMinimize,
  onFinish,
  onHeartbeat,
}: {
  taskId: string;
  taskTitle: string;
  // Resolved by the trigger (getActiveFocusSession) BEFORE this modal ever
  // mounts -- a resumable session (this device, a crashed tab, or a
  // different device entirely) shows the "Devam eden bir seansın var..."
  // prompt first instead of the normal mode picker. null means there's
  // genuinely nothing to resume (including a stale one already
  // auto-flushed server-side).
  initialSession: ActiveFocusSession | null;
  // Fired once, right when Başlat is clicked (fire-and-forget from this
  // modal's perspective -- the visual timer never waits on it, matching
  // every other persistence call here).
  onStart: (mode: FocusTimerMode, countdownTargetSeconds: number | null) => void;
  // Mola Ver -- banks the live segment server-side and flips to paused.
  onPause: () => void;
  // Shared by the resume prompt's "Süre tutmaya devam et" AND Mola Ver's
  // own "Devam Et" -- returns the server's reconciled elapsed seconds
  // (null if there was nothing to resume), which the resume prompt needs
  // to seed its local display from (this modal has no memory of a session
  // it didn't start itself).
  onResumeSession: () => Promise<{ elapsedSeconds: number } | null>;
  // Called on an explicit "Vazgeç" click -- with however many seconds had
  // accumulated at that point (0 if the session never started). Persistence
  // itself is server-authoritative (endFocusSession re-derives the true
  // elapsed from the session row), so `seconds` here is only ever used for
  // this modal's own display text. Simply leaving the page does NOT call
  // this: the session keeps running server-side.
  onCancel: (seconds: number) => void;
  // Closes this fullscreen timer WITHOUT ending or pausing the session: it
  // keeps running on the server and the floating widget takes over on every
  // page. Without this the only ways out were Bitir / Vazgeç / Mola Ver, all of
  // which end or pause it.
  onMinimize?: () => void;
  // `creditedSeconds` is set only when the student ended the session from
  // the "Hâlâ çalışmaya devam ediyor musun?" check-in and chose to shorten
  // the figure; otherwise the full elapsed time is credited.
  onFinish: (result: { mode: FocusTimerMode; seconds: number; creditedSeconds?: number }) => void;
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
  const [finishing, setFinishing] = useState<{
    mode: FocusTimerMode;
    seconds: number;
    goalHit: boolean;
    creditedSeconds?: number;
  } | null>(null);
  // Shown instead of the mode picker while there's a resumable session to
  // decide on -- cleared either by "Süre tutmaya devam et" (jumps straight
  // to the running screen) or "Yeni Başlat" (falls through to the picker;
  // the old session isn't lost, startFocusSession banks it transparently).
  const [resumePromptPending, setResumePromptPending] = useState(initialSession !== null);
  const [resumeActionPending, setResumeActionPending] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  // Picked once per mount -- since the parent only mounts this modal while
  // it's open, every fresh "open" gets its own random pick.
  const backgroundIndex = useMemo(() => randomFocusTimerAnimationIndex(), []);

  // While this fullscreen timer is open the floating widget hides (same
  // timer); the moment it unmounts, the widget takes over if the session is
  // still running.
  useEffect(() => {
    focusModalStore.opened();
    return () => focusModalStore.closed();
  }, []);

  // Driven by the background ticker rather than setInterval: a hidden tab
  // throttles setInterval to about once a minute, which would freeze the
  // running clock (and the tab title below) while the student is on another tab.
  useEffect(() => {
    if (!running) return;
    return subscribeTick(() => {
      if (startedAtRef.current !== null) setElapsedMs(Date.now() - startedAtRef.current);
    });
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

  // Bitir's celebration screen hands off to the parent after a beat.
  useEffect(() => {
    if (!finishing) return;
    const id = setTimeout(() => {
      onFinish({ mode: finishing.mode, seconds: finishing.seconds, creditedSeconds: finishing.creditedSeconds });
    }, SUCCESS_DISPLAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing]);

  // NOTE -- what is deliberately NOT here any more:
  //  * no cleanup that ends the session when this modal unmounts (leaving
  //    the dashboard used to end it);
  //  * no beforeunload / sendBeacon that paused it on tab close, refresh or
  //    navigating to another site (YouTube, ...).
  // A running session lives on the server (wall-clock timestamps), so it keeps
  // counting through tab switches, other sites, other pages of the platform
  // and closed tabs alike. The only things that end or pause it are the
  // student's own Bitir / Vazgeç / Mola Ver clicks.

  // Hidden tabs throttle setInterval (to about once a minute), so the
  // display can lag while the student is elsewhere. Elapsed is computed from
  // the wall clock, not counted in ticks -- so nothing is lost, and this just
  // refreshes the readout the instant they come back.
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === "visible" && startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, []);

  // Picked once when the session actually finishes, not re-rolled while
  // the success screen is showing.
  const praiseMessage = useMemo(() => (finishing ? resolvePraiseMessage(finishing) : ""), [finishing]);

  const totalSeconds = mode === "countdown" ? countdownMinutes * 60 : 0;
  const elapsedSeconds = elapsedMs / 1000;
  const displaySeconds = mode === "countdown" ? Math.max(0, totalSeconds - elapsedSeconds) : elapsedSeconds;
  const countdownDone = mode === "countdown" && elapsedSeconds >= totalSeconds;

  // "Hâlâ çalışmaya devam ediyor musun?" every 3 hours of a running session.
  // The timer is never stopped or trimmed by it (see lib/focus-confirmation).
  const stillStudying = useStillStudyingPrompt(taskId, elapsedSeconds, running && !finishing);

  // The browser-tab title carries the live clock ("⏳ 01:25:30") so it stays
  // visible from the tab bar while the student is on another site.
  const shownWhole = Math.floor(displaySeconds);
  const titleActive = running && !finishing;
  useEffect(() => {
    setTimerTitle(titleActive ? formatTimerTitle(shownWhole, stillStudying.due) : null);
  }, [titleActive, shownWhole, stillStudying.due]);
  useEffect(() => () => setTimerTitle(null), []);

  // Optional always-on-top Picture-in-Picture window (Chrome/Edge/Safari on
  // desktop). Shown only where the browser supports it.
  const pipSupported = isPipSupported();
  const pipOpen = useSyncExternalStore(pipStore.subscribe, pipStore.getSnapshot, pipStore.getServerSnapshot);
  async function handlePip() {
    if (pipOpen) {
      closePip();
      return;
    }
    // Directly inside the click: browsers only allow this from a user gesture.
    const result = await openPip();
    if (result === "failed") toast.error("Pencere açılamadı. Tarayıcın buna izin vermiyor olabilir.");
  }

  function handleStart() {
    clearConfirmedMultiple(taskId);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStarted(true);
    setRunning(true);
    onStart(mode, mode === "countdown" ? countdownMinutes * 60 : null);
  }

  function handleTakeBreak() {
    setRunning(false);
    setOnBreak(true);
    startedAtRef.current = null;
    onPause();
  }

  function handleResume() {
    setOnBreak(false);
    startedAtRef.current = Date.now() - elapsedMs;
    setRunning(true);
    onResumeSession().catch(() => {});
  }

  // The resume prompt's "Süre tutmaya devam et" -- unlike handleResume
  // above, this modal has no local memory of a session it didn't start
  // itself, so it seeds elapsedMs from the server's reconciled value
  // (falling back to the prompt's own already-displayed estimate if the
  // network call itself fails, rather than stranding the student on the
  // prompt screen).
  async function handleResumeFromPrompt() {
    if (!initialSession) return;
    setResumeActionPending(true);
    let seconds = initialSession.elapsedSeconds;
    try {
      const result = await onResumeSession();
      if (result) seconds = result.elapsedSeconds;
    } catch {
      // Fall through with the prompt's own last-known elapsed.
    }
    setMode(initialSession.mode);
    if (initialSession.mode === "countdown" && initialSession.countdownTargetSeconds) {
      setCountdownMinutes(Math.round(initialSession.countdownTargetSeconds / 60));
    }
    startedAtRef.current = Date.now() - seconds * 1000;
    setElapsedMs(seconds * 1000);
    setStarted(true);
    setRunning(true);
    setResumeActionPending(false);
    setResumePromptPending(false);
  }

  // "Yeni Başlat" -- falls through to the normal mode picker. The old
  // session isn't discarded: startFocusSession (fired from the next
  // handleStart, via onStart) transparently banks it first.
  function handleDiscardResume() {
    setResumePromptPending(false);
  }

  function handleFinish() {
    setRunning(false);
    // A countdown ended early via Bitir (before its target was reached)
    // doesn't count as "hitting the goal" -- only countdownDone does.
    setFinishing({ mode, seconds: Math.round(elapsedSeconds), goalHit: countdownDone });
  }

  // "Hayır, bitir" on the check-in: ends the session, crediting either the
  // full elapsed time (creditedSeconds undefined) or the shorter figure the
  // student typed.
  function handleEndFromPrompt(creditedSeconds?: number) {
    setRunning(false);
    setFinishing({
      mode,
      seconds: creditedSeconds ?? Math.round(elapsedSeconds),
      goalHit: false,
      creditedSeconds,
    });
  }

  // The explicit "Vazgeç" click -- reports whatever's accumulated so far
  // before closing. Bailing straight from the resume prompt (never actually
  // pressing Devam Et or Yeni Başlat) still banks that pre-existing
  // session's real elapsed -- same "close and bank whatever's active"
  // meaning Vazgeç already has everywhere else, it just happens to apply to
  // a session this modal instance didn't start itself.
  function handleCancelClick() {
    const seconds = started
      ? Math.round(elapsedMs / 1000)
      : resumePromptPending && initialSession
        ? Math.round(initialSession.elapsedSeconds)
        : 0;
    onCancel(seconds);
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
                {needsCoachApproval(finishing.seconds)
                  ? `${formatSeconds(finishing.seconds)} kaydedildi ama 6 saati aştığı için koçunun onayını bekliyor. Onaylanınca sıralamana ve istatistiklerine eklenecek.`
                  : `${formatSeconds(finishing.seconds)} boyunca odaklandın. Bu süre göreve kaydedildi.`}
              </p>
            </div>
          </>
        ) : resumePromptPending && initialSession ? (
          <>
            <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
              <History className="text-primary size-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-foreground text-lg font-semibold">Devam eden bir seansın var</h2>
              <p className="text-muted-foreground max-w-[260px] truncate text-sm" title={taskTitle}>
                {taskTitle}
              </p>
            </div>
            <p className="text-foreground text-5xl font-bold tabular-nums">
              {formatSeconds(initialSession.elapsedSeconds)}
            </p>
            <p className="text-muted-foreground text-sm">
              {initialSession.status === "running" ? "Süre arka planda işlemeye devam etti" : "Duraklatılmış"}
            </p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="lg" onClick={handleDiscardResume} disabled={resumeActionPending}>
                Yeni Başlat
              </Button>
              <Button type="button" size="lg" onClick={handleResumeFromPrompt} disabled={resumeActionPending}>
                <Play className="size-4" />
                Süre tutmaya devam et
              </Button>
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
            {onMinimize && (
              <div className="flex w-full flex-col items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={onMinimize}
                  className="h-14 w-full max-w-xs gap-2 bg-emerald-600 px-8 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700"
                >
                  <Minimize2 className="size-5" />
                  Arka planda çalışsın
                </Button>
                <p className="text-muted-foreground max-w-[280px] text-xs">
                  Bu ekrandan çık, sayaç çalışmaya devam etsin. Sağ alttaki küçük kartta görürsün; sekme başlığında da
                  süre akar.
                </p>
                {pipSupported && (
                  <Button type="button" variant="outline" onClick={handlePip} className="w-full max-w-xs gap-2">
                    <PictureInPicture2 className="size-4" />
                    {pipOpen ? "Ayrı pencereyi kapat" : "Ayrı pencerede aç (YouTube'un üstünde kalır)"}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {stillStudying.due && (
        <StillStudyingPrompt
          elapsedSeconds={elapsedSeconds}
          onConfirm={stillStudying.confirm}
          onEnd={handleEndFromPrompt}
        />
      )}
    </div>
  );
}
