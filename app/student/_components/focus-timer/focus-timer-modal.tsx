"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Coffee, Minimize2, Pause, PictureInPicture2, Play, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { subscribeTick } from "@/lib/background-ticker";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { closePip, isPipSupported, openPip, pipStore } from "@/lib/focus-pip";
import { formatTimerTitle, setTimerTitle } from "@/lib/focus-title";
import { focusModalStore } from "@/lib/focus-modal-store";
import { FocusTimerBackground, randomFocusTimerAnimationIndex } from "./focus-timer-animations";
import { StillStudyingPrompt, useStillStudyingPrompt } from "./still-studying-prompt";

export type FocusTimerMode = "stopwatch" | "countdown";

const COUNTDOWN_PRESETS_MIN = [15, 25, 45, 60];
const HEARTBEAT_INTERVAL_MS = 20_000;

function formatSeconds(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// "47 dk", "2 sa 5 dk", "40 sn".
function formatLogged(totalSeconds: number) {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} sn`;
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dk`;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

// A session that is ALREADY running when the timer opens (alive in another tab
// / the floating widget / another device): the timer just shows it, running.
export type AttachedFocusSession = {
  mode: FocusTimerMode;
  countdownTargetSeconds: number | null;
  elapsedSeconds: number;
};

// A leftover session that was closed out automatically when the timer opened.
export type BankedNotice = { seconds: number; pendingApproval: boolean };

// What state the timer was in when it was closed with the X / Escape.
export type CloseState = "running" | "paused" | "idle";

// Full-viewport, backdrop-blurred overlay. Closing it (X, Escape, the green
// "Arka planda çalışsın" button) never discards anything: a running session
// simply carries on in the background and shows up in the floating widget.
export function FocusTimerModal({
  taskId,
  taskTitle,
  attachSession,
  bankedNotice,
  onStart,
  onPause,
  onResumeSession,
  onClose,
  onFinish,
  onHeartbeat,
}: {
  taskId: string;
  taskTitle: string;
  attachSession: AttachedFocusSession | null;
  bankedNotice: BankedNotice | null;
  // Fired once, right when Başlat is clicked (fire-and-forget from this
  // modal's perspective -- the visual timer never waits on it).
  onStart: (mode: FocusTimerMode, countdownTargetSeconds: number | null) => void;
  // Mola Ver -- banks the live segment server-side and flips to paused.
  onPause: () => void;
  // Mola Ver's own "Devam Et".
  onResumeSession: () => Promise<{ elapsedSeconds: number } | null>;
  // The X / Escape / "Arka planda çalışsın". Closes this screen WITHOUT
  // ending or discarding anything -- the parent only decides what to tell the
  // student, according to `state`.
  onClose: (state: CloseState) => void;
  // Bitir (and "Hayır, bitir" on the check-in). The parent closes this screen
  // and saves in the background -- nothing here waits for the server, so it
  // feels instant. `creditedSeconds` is set only when the student shortened the
  // figure from the check-in; otherwise the full elapsed time is credited.
  onFinish: (result: { mode: FocusTimerMode; seconds: number; goalHit: boolean; creditedSeconds?: number }) => void;
  // Fired immediately whenever the timer starts/resumes, then every
  // HEARTBEAT_INTERVAL_MS while it keeps running.
  onHeartbeat?: () => void;
}) {
  const [mode, setMode] = useState<FocusTimerMode>(attachSession?.mode ?? "stopwatch");
  const [started, setStarted] = useState(attachSession !== null);
  const [countdownMinutes, setCountdownMinutes] = useState(() =>
    attachSession?.mode === "countdown" && attachSession.countdownTargetSeconds
      ? Math.round(attachSession.countdownTargetSeconds / 60)
      : 25,
  );
  const [customMinutes, setCustomMinutes] = useState("");
  const [running, setRunning] = useState(attachSession !== null);
  const [onBreak, setOnBreak] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(() => (attachSession ? attachSession.elapsedSeconds * 1000 : 0));
  const startedAtRef = useRef<number | null>(null);

  // Attaching to an already-running session: anchor the local clock to the
  // server's elapsed time.
  useEffect(() => {
    if (attachSession) startedAtRef.current = Date.now() - attachSession.elapsedSeconds * 1000;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picked once per mount -- every fresh "open" gets its own random pick.
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
  // right away whenever `running` flips true, then every HEARTBEAT_INTERVAL_MS.
  useEffect(() => {
    if (!running) return;
    onHeartbeat?.();
    const id = setInterval(() => onHeartbeat?.(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // NOTE -- deliberately NOT here: any cleanup that ends the session when this
  // modal unmounts, and any beforeunload/sendBeacon that pauses it. A running
  // session lives on the server (wall-clock timestamps), so it keeps counting
  // through tab switches, other sites, other pages of the platform and even a
  // closed tab; on return the time is worked out from the start timestamp.
  // Only the student's own Bitir / Mola Ver ends or pauses it.

  // Hidden tabs throttle timers, so the display can lag while the student is
  // elsewhere. Elapsed is computed from the wall clock, so nothing is lost;
  // this refreshes the readout the instant they come back.
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === "visible" && startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, []);

  const totalSeconds = mode === "countdown" ? countdownMinutes * 60 : 0;
  const elapsedSeconds = elapsedMs / 1000;
  const displaySeconds = mode === "countdown" ? Math.max(0, totalSeconds - elapsedSeconds) : elapsedSeconds;
  const countdownDone = mode === "countdown" && elapsedSeconds >= totalSeconds;

  // "Hâlâ çalışmaya devam ediyor musun?" every 3 hours of a running session.
  // The timer is never stopped or trimmed by it (see lib/focus-confirmation).
  const stillStudying = useStillStudyingPrompt(taskId, elapsedSeconds, running);

  // The browser-tab title carries the live clock ("⏳ 01:25:30") so it stays
  // visible from the tab bar while the student is on another site.
  const shownWhole = Math.floor(displaySeconds);
  useEffect(() => {
    setTimerTitle(running ? formatTimerTitle(shownWhole, stillStudying.due) : null);
  }, [running, shownWhole, stillStudying.due]);
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

  // Bitir: hand off IMMEDIATELY. The parent closes this screen on the spot and
  // saves in the background, so the click always feels instant.
  function handleFinish() {
    setRunning(false);
    // A countdown ended early via Bitir (before its target was reached)
    // doesn't count as "hitting the goal" -- only countdownDone does.
    onFinish({ mode, seconds: Math.round(elapsedSeconds), goalHit: countdownDone });
  }

  // "Hayır, bitir" on the check-in: credits either the full elapsed time
  // (creditedSeconds undefined) or the shorter figure the student typed.
  function handleEndFromPrompt(creditedSeconds?: number) {
    setRunning(false);
    onFinish({
      mode,
      seconds: creditedSeconds ?? Math.round(elapsedSeconds),
      goalHit: false,
      creditedSeconds,
    });
  }

  // The X, Escape and the green button all mean the same thing: leave this
  // screen, lose nothing.
  function handleClose() {
    onClose(running ? "running" : started ? "paused" : "idle");
  }

  // Escape closes it too -- but never while the check-in question is up.
  const closeRef = useRef(handleClose);
  useEffect(() => {
    closeRef.current = handleClose;
  });
  const promptDueRef = useRef(false);
  useEffect(() => {
    promptDueRef.current = stillStudying.due;
  });
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !promptDueRef.current) closeRef.current();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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
  // modal is type="button" with no default browser action worth blocking.
  // It must NOT go on the keydown guard: the "özel süre" number input relies
  // on default keydown behavior for digits/backspace/arrow-spinners.
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

      {/* The close button. Never discards: a running timer keeps running in the
          floating widget, a paused one is saved the next time Süre Tut is
          pressed on this task. */}
      <button
        type="button"
        onClick={handleClose}
        aria-label={running ? "Kapat (sayaç arka planda çalışmaya devam eder)" : "Kapat"}
        title={running ? "Kapat — sayaç arka planda çalışmaya devam eder" : "Kapat"}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground absolute top-5 right-5 z-10 rounded-full p-2 transition-colors"
      >
        <X className="size-5" />
      </button>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
        {!started ? (
          <>
            {bankedNotice && (
              <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Önceki çalışman kaydedildi
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {bankedNotice.pendingApproval
                    ? `${formatLogged(bankedNotice.seconds)} 6 saati aştığı için koçunun onayını bekliyor. Onaylanınca sıralamana ve istatistiklerine eklenecek.`
                    : `${formatLogged(bankedNotice.seconds)} bu göreve eklendi.`}
                </p>
              </div>
            )}
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
            <div className="flex w-full flex-col items-center gap-2 pt-2">
              <Button
                type="button"
                size="lg"
                onClick={handleClose}
                className="h-14 w-full max-w-xs gap-2 bg-emerald-600 px-8 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700"
              >
                <Minimize2 className="size-5" />
                Arka planda çalışsın
              </Button>
              <p className="text-muted-foreground max-w-[280px] text-xs">
                Bu ekrandan çık, sayaç çalışmaya devam etsin. Sağ alttaki küçük kartta görürsün; sekme başlığında da
                süre akar. Kapatmak (X) süreni silmez.
              </p>
              {pipSupported && (
                <Button type="button" variant="outline" onClick={handlePip} className="w-full max-w-xs gap-2">
                  <PictureInPicture2 className="size-4" />
                  {pipOpen ? "Ayrı pencereyi kapat" : "Ayrı pencerede aç (YouTube'un üstünde kalır)"}
                </Button>
              )}
            </div>
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
