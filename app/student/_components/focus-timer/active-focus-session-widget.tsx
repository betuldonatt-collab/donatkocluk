"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pause, PictureInPicture2, Play, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { subscribeTick } from "@/lib/background-ticker";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { focusEndingStore, focusModalStore, focusOptimisticSessionStore } from "@/lib/focus-modal-store";
import { resolvePraiseMessage } from "@/lib/focus-praise";
import { closePip, isPipSupported, openPip, pipStore, updatePip } from "@/lib/focus-pip";
import { formatTimerClock, formatTimerTitle, setTimerTitle } from "@/lib/focus-title";
import {
  endFocusSession,
  getRunningFocusSessions,
  heartbeatFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  sendFocusHeartbeat,
  type RunningFocusSession,
} from "../../actions";
import { StillStudyingPrompt, useStillStudyingPrompt } from "./still-studying-prompt";

const HEARTBEAT_INTERVAL_MS = 20_000;
// While the Picture-in-Picture window is open, re-read the server this often
// (in 500 ms ticks) so a Mola given elsewhere shows up there too.
const PIP_RESYNC_TICKS = 20;

type LiveSession = RunningFocusSession & { fetchedAt: number };

// A paused session's time is final (Mola Ver already banked the run
// through the moment it was clicked) -- it must NOT keep ticking with the
// wall clock, unlike a running one.
function elapsedNow(session: LiveSession, now: number) {
  if (session.status === "paused") return session.elapsedSeconds;
  return session.elapsedSeconds + Math.max(0, (now - session.fetchedAt) / 1000);
}

// What to show as the big number: the countdown's remaining time, else
// elapsed PLUS whatever was already banked on this task earlier (so a
// student back from a Mola sees the count continue, not restart at 0) --
// display-only, never what actually gets credited on Bitir (see
// RunningSessionCard.handleEnd, which uses elapsedNow directly).
function displaySeconds(session: LiveSession, now: number) {
  const elapsed = elapsedNow(session, now);
  if (session.mode === "countdown" && session.countdownTargetSeconds !== null) {
    return Math.max(0, session.countdownTargetSeconds - elapsed);
  }
  return elapsed + session.priorTrackedSeconds;
}

function modeLabel(session: LiveSession, now: number) {
  if (session.status === "paused") return "Molada — süren güvende";
  if (session.mode === "countdown" && session.countdownTargetSeconds !== null) {
    return displaySeconds(session, now) === 0 ? "Süre doldu" : "Geri sayım";
  }
  return "Kronometre çalışıyor";
}

// Floating "a timer is still running" card, mounted once in the student
// layout. A running Süre Tut session lives on the server, so it keeps counting
// through tab switches and page changes; this widget is how the student sees
// and controls it from any page of the platform -- and how the "Hâlâ çalışmaya
// devam ediyor musun?" check-in reaches them when they're not inside the
// fullscreen timer. It hides while the fullscreen timer itself is open (same
// timer, no need to show it twice).
//
// It also hosts the Picture-in-Picture window (lib/focus-pip.ts): because this
// component lives in the layout it outlasts page navigation, and the window
// keeps updating on the background ticker even while this tab is hidden.
export function ActiveFocusSessionWidget() {
  const pathname = usePathname();
  const modalOpen = useSyncExternalStore(focusModalStore.subscribe, focusModalStore.getSnapshot, focusModalStore.getServerSnapshot) > 0;
  const pipOpen = useSyncExternalStore(pipStore.subscribe, pipStore.getSnapshot, pipStore.getServerSnapshot);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  // Sessions whose Bitir or Mola was just clicked and whose save is still in
  // flight: hidden immediately (both are optimistic), settled by the effect
  // further down once a fresh read confirms the outcome.
  const endingKey = useSyncExternalStore(
    focusEndingStore.subscribe,
    focusEndingStore.getSnapshot,
    focusEndingStore.getServerSnapshot,
  );
  // Set by the fullscreen timer the instant it closes while still running --
  // shown immediately, before this widget's own server read (below) has had
  // a chance to land, since that read fires off the same transition and can
  // race the write that created the session (see its own 2s retry comment).
  // Dropped the moment `sessions` confirms it (the effect further down) so
  // the real, server-driven reading takes over from then on.
  const optimisticSession = useSyncExternalStore(
    focusOptimisticSessionStore.subscribe,
    focusOptimisticSessionStore.getSnapshot,
    focusOptimisticSessionStore.getServerSnapshot,
  );
  const mergedSessions =
    optimisticSession && !sessions.some((s) => s.taskId === optimisticSession.taskId)
      ? [optimisticSession, ...sessions]
      : sessions;

  useEffect(() => {
    if (optimisticSession && sessions.some((s) => s.taskId === optimisticSession.taskId)) {
      focusOptimisticSessionStore.clear(optimisticSession.taskId);
    }
  }, [sessions, optimisticSession]);

  const refresh = useCallback(async () => {
    const running = await getRunningFocusSessions();
    const fetchedAt = Date.now();
    setSessions(running.map((s) => ({ ...s, fetchedAt })));
  }, []);

  // A taskId lands here the instant its "ending" flag lifts (Bitir's save
  // attempt settled, success or fail -- see focusEndingStore), and leaves the
  // moment a fresh read has actually confirmed the outcome either way. Without
  // this, lifting "ending" alone could let this widget's OWN still-stale
  // `sessions` (from before the save) flash the card back, ticking off old
  // data, for however long the confirming read takes -- shared by both Bitir
  // entry points (this card's own button, and the fullscreen timer's), since
  // both only ever go through the same focusEndingStore.
  const [settling, setSettling] = useState<Set<string>>(() => new Set());
  const previousEndingIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentIds = endingKey ? endingKey.split(",") : [];
    const justSettled = previousEndingIdsRef.current.filter((id) => !currentIds.includes(id));
    previousEndingIdsRef.current = currentIds;
    if (justSettled.length === 0) return;
    setSettling((prev) => new Set([...prev, ...justSettled]));
    refresh().finally(() => {
      setSettling((prev) => {
        const next = new Set(prev);
        for (const id of justSettled) next.delete(id);
        return next;
      });
    });
  }, [endingKey, refresh]);

  const visibleSessions = mergedSessions.filter((s) => {
    if (endingKey && endingKey.split(",").includes(s.taskId)) return false;
    if (settling.has(s.taskId)) return false;
    return true;
  });

  // Re-read the server whenever something that could have changed it
  // happens: mount / route change, the fullscreen timer closing (a session may
  // have been left running), and the PiP window opening. While the fullscreen
  // timer is open the read is skipped -- unless PiP needs the data.
  useEffect(() => {
    if (modalOpen && !pipOpen) return;
    let cancelled = false;
    function load() {
      getRunningFocusSessions()
        .then((running) => {
          if (cancelled) return;
          const fetchedAt = Date.now();
          setSessions(running.map((s) => ({ ...s, fetchedAt })));
        })
        .catch(() => {});
    }
    load();
    // A session that was just started and minimised straight away may not be
    // written yet when the first read lands -- look once more shortly after.
    const retry = setTimeout(load, 2000);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [modalOpen, pipOpen, pathname, endingKey]);

  useEffect(() => {
    function handleReturn() {
      if (document.visibilityState === "visible" && !focusModalStore.getSnapshot()) refresh().catch(() => {});
    }
    document.addEventListener("visibilitychange", handleReturn);
    window.addEventListener("focus", handleReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleReturn);
      window.removeEventListener("focus", handleReturn);
    };
  }, [refresh]);

  return (
    <>
      <PipDriver sessions={visibleSessions} active={pipOpen} onResync={refresh} />
      {!modalOpen && visibleSessions.length > 0 && (
        <div className="fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2 print:hidden">
          {visibleSessions.map((session, index) => (
            <RunningSessionCard key={session.taskId} session={session} ownsTitle={index === 0} pipOpen={pipOpen} onChanged={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

// Feeds the Picture-in-Picture window (when open) with the first running
// session's reading, on the background ticker so it keeps counting while this
// tab is hidden. Renders nothing.
function PipDriver({
  sessions,
  active,
  onResync,
}: {
  sessions: LiveSession[];
  active: boolean;
  onResync: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ticks = useRef(0);

  useEffect(() => {
    if (!active) return;
    return subscribeTick(() => {
      setNow(Date.now());
      ticks.current += 1;
      if (ticks.current % PIP_RESYNC_TICKS === 0) onResync().catch(() => {});
    });
  }, [active, onResync]);

  const first = sessions[0];
  useEffect(() => {
    if (!active) return;
    updatePip(
      first
        ? { time: formatTimerClock(displaySeconds(first, now)), label: modeLabel(first, now), taskTitle: first.taskTitle, running: true }
        : { time: "--:--", label: "Çalışan sayaç yok", taskTitle: "", running: false },
    );
  }, [active, first, now]);

  return null;
}

function RunningSessionCard({
  session,
  ownsTitle,
  pipOpen,
  onChanged,
}: {
  session: LiveSession;
  // Only one card drives the browser-tab title (with several sessions the
  // title would otherwise flip between them).
  ownsTitle: boolean;
  pipOpen: boolean;
  // Called after a successful Mola/Devam Et so the parent re-reads the
  // server and this card picks up the right paused/running look (frozen
  // time + "Molada", or a fresh ticking baseline) instead of guessing at it.
  onChanged: () => void;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [resuming, setResuming] = useState(false);
  // Cards only mount client-side (after the sessions are fetched), so reading
  // browser capabilities here can't cause a hydration mismatch.
  const pipSupported = isPipSupported();
  const isPaused = session.status === "paused";

  const elapsedSeconds = elapsedNow(session, now);
  const shownSeconds = displaySeconds(session, now);

  // Ticks on the background ticker, not setInterval: a hidden tab throttles
  // setInterval to about once a minute, which would freeze the tab-title clock.
  // A paused session's number is frozen (elapsedNow ignores `now` for it), so
  // this only visibly matters for a running one -- kept unconditional anyway,
  // it's a no-op re-render otherwise.
  useEffect(() => subscribeTick(() => setNow(Date.now())), []);

  // Coach-visible live status while the widget (rather than the fullscreen
  // timer) is what's tracking this session. Pointless (and a no-op server-side
  // anyway) while paused, so skipped entirely then.
  const heartbeatRef = useRef(() => {
    sendFocusHeartbeat().catch(() => {});
    heartbeatFocusSession(session.taskId).catch(() => {});
  });
  useEffect(() => {
    if (isPaused) return;
    const beat = heartbeatRef.current;
    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPaused]);

  const { due, confirm } = useStillStudyingPrompt(session.taskId, elapsedSeconds, !isPaused);

  // Devam Et -- true resume (not a bank + fresh start): the server flips the
  // session straight back to running from its exact banked total. Not
  // optimistic like Mola/Bitir below, since there's no natural "hidden"
  // state to show in between -- it stays on screen throughout, just briefly
  // disabled, then the parent's fresh read (onChanged) takes over ticking.
  function handleResumeClick() {
    setResuming(true);
    resumeFocusSession(session.taskId)
      .then((result) => {
        if (!result) {
          toast.error("Bu mola artık geçerli değil, görevdeki Süre Tut'a bas.");
          return;
        }
        onChanged();
      })
      .catch(() => toast.error("Devam edilemedi, tekrar dene."))
      .finally(() => setResuming(false));
  }

  // The tab title shows the running time ("⏳ 01:25:30") so it's visible from
  // the tab bar while the student is on another site -- pointless while
  // paused (nothing is ticking), so left as the plain page title then.
  const shownWhole = Math.floor(shownSeconds);
  useEffect(() => {
    if (!ownsTitle) return;
    setTimerTitle(isPaused ? null : formatTimerTitle(shownWhole, due));
  }, [ownsTitle, shownWhole, due, isPaused]);
  useEffect(() => {
    if (!ownsTitle) return;
    return () => setTimerTitle(null);
  }, [ownsTitle]);

  // Mola stays visible throughout -- unlike Bitir below, pausing doesn't
  // remove the card, it just switches this same card to the frozen
  // "Molada" look, so the banked time is never off-screen even for a
  // moment. onChanged() re-reads the server once paused, picking up the
  // frozen elapsedSeconds and the "paused" status.
  function handlePause() {
    const taskId = session.taskId;
    pauseFocusSession(taskId)
      .then(() => {
        toast.success("Mola verildi. Süren üstte görünüyor.");
        onChanged();
      })
      .catch(() => toast.error("Mola verilemedi, tekrar dene."))
      .finally(() => {
        focusOptimisticSessionStore.clear(taskId);
      });
  }

  // Bitir is OPTIMISTIC: the card disappears the instant it's clicked (the
  // session is added to the "ending" set, which the widget hides) and the save
  // finishes in the background behind a "Süren kaydediliyor…" toast. If the save
  // fails, the session is still running on the server, so it comes back here.
  function handleEnd(creditedSeconds?: number) {
    const taskId = session.taskId;
    const savedSeconds = creditedSeconds ?? Math.round(elapsedSeconds);
    const goalHit =
      session.mode === "countdown" &&
      session.countdownTargetSeconds !== null &&
      elapsedSeconds >= session.countdownTargetSeconds;
    focusEndingStore.begin(taskId);
    const toastId = toast.loading("Süren kaydediliyor…");

    endFocusSession(taskId, creditedSeconds)
      .then((ended) => {
        if (!ended.ok) {
          toast.error(ended.error, { id: toastId });
          return;
        }
        clearConfirmedMultiple(taskId);
        const clock = formatTimerClock(savedSeconds);
        if (ended.pendingApproval) {
          toast.warning(`${clock} çok uzun olduğu için koç onayına gönderildi.`, { id: toastId });
        } else if (savedSeconds > 0) {
          toast.success(`${resolvePraiseMessage(savedSeconds, goalHit)} ${clock} boyunca odaklandın, göreve kaydedildi.`, {
            id: toastId,
          });
        } else {
          toast.dismiss(toastId);
        }
        router.refresh();
      })
      .catch(() => toast.error("Odak süresi kaydedilemedi, tekrar dene.", { id: toastId }))
      .finally(() => {
        focusOptimisticSessionStore.clear(taskId);
        // Lifting this doesn't by itself risk a flash of stale data: the
        // "settling" effect below (shared with FocusTimerTrigger's own
        // Bitir) keeps this taskId hidden until a fresh read has actually
        // confirmed it either way.
        focusEndingStore.end(taskId);
      });
  }

  async function handlePip() {
    if (pipOpen) {
      closePip();
      return;
    }
    // Directly inside the click: browsers only allow this from a user gesture.
    const result = await openPip();
    if (result === "failed") toast.error("Pencere açılamadı. Tarayıcın buna izin vermiyor olabilir.");
  }

  return (
    <>
      <div className={cn("border-border bg-card flex w-72 flex-col gap-2 rounded-lg border p-3 shadow-lg", isPaused && "border-amber-500/40")}>
        <div className="flex items-center gap-2">
          {isPaused ? (
            <span className="relative flex size-2.5 shrink-0">
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
            </span>
          ) : (
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
          <Timer className="text-muted-foreground size-4 shrink-0" />
          <p className="text-foreground min-w-0 flex-1 truncate text-xs font-medium" title={session.taskTitle}>
            {session.taskTitle}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-foreground text-2xl font-bold tabular-nums">{formatTimerClock(shownSeconds)}</p>
            <p className={cn("text-[11px]", isPaused ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              {modeLabel(session, now)}
            </p>
          </div>
          <div className="flex gap-1.5">
            {pipSupported && !isPaused && (
              <Button
                type="button"
                variant={pipOpen ? "secondary" : "outline"}
                size="icon"
                className="size-8"
                onClick={handlePip}
                aria-label={pipOpen ? "Ayrı pencereyi kapat" : "Sayacı ayrı, üstte duran bir pencerede aç"}
                title={pipOpen ? "Ayrı pencereyi kapat" : "Ayrı pencerede aç (diğer sitelerin üstünde kalır)"}
              >
                <PictureInPicture2 className="size-4" />
              </Button>
            )}
            {isPaused ? (
              <Button type="button" size="sm" onClick={handleResumeClick} disabled={resuming}>
                <Play className="size-3.5" />
                Devam Et
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={handlePause}>
                <Pause className="size-3.5" />
                Mola
              </Button>
            )}
            <Button type="button" size="sm" variant={isPaused ? "outline" : "default"} onClick={() => handleEnd()}>
              Bitir
            </Button>
          </div>
        </div>
      </div>

      {due && (
        <StillStudyingPrompt
          elapsedSeconds={elapsedSeconds}
          onConfirm={confirm}
          onEnd={(credited) => handleEnd(credited)}
        />
      )}
    </>
  );
}
