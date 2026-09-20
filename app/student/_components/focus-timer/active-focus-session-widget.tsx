"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pause, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { clearConfirmedMultiple } from "@/lib/focus-confirmation";
import { focusModalStore } from "@/lib/focus-modal-store";
import {
  endFocusSession,
  getRunningFocusSessions,
  heartbeatFocusSession,
  pauseFocusSession,
  sendFocusHeartbeat,
  type RunningFocusSession,
} from "../../actions";
import { StillStudyingPrompt, useStillStudyingPrompt } from "./still-studying-prompt";

const HEARTBEAT_INTERVAL_MS = 20_000;

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

// Floating "a timer is still running" card, mounted once in the student
// layout. The fullscreen Focus Timer modal used to END the session when it
// unmounted (leaving the dashboard) and paused it on tab close; now a
// session simply keeps running on the server, and this widget is how the
// student sees and controls it from any page of the platform -- and how the
// "Hâlâ çalışmaya devam ediyor musun?" check-in reaches them when they're
// not inside the modal. It hides while the modal itself is open (same timer,
// no need to show it twice).
export function ActiveFocusSessionWidget() {
  const pathname = usePathname();
  const modalOpen = useSyncExternalStore(focusModalStore.subscribe, focusModalStore.getSnapshot, focusModalStore.getServerSnapshot) > 0;
  const [sessions, setSessions] = useState<(RunningFocusSession & { fetchedAt: number })[]>([]);

  const refresh = useCallback(async () => {
    const running = await getRunningFocusSessions();
    const fetchedAt = Date.now();
    setSessions(running.map((s) => ({ ...s, fetchedAt })));
  }, []);

  // Re-read the server whenever something that could have changed it
  // happens: mount / route change, the modal closing (a session may have been
  // left running), and the student coming back to this tab or window.
  useEffect(() => {
    if (modalOpen) return;
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
  }, [modalOpen, pathname]);

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

  if (modalOpen || sessions.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2 print:hidden">
      {sessions.map((session) => (
        <RunningSessionCard key={session.taskId} session={session} onChanged={refresh} />
      ))}
    </div>
  );
}

function RunningSessionCard({
  session,
  onChanged,
}: {
  session: RunningFocusSession & { fetchedAt: number };
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  // Live elapsed = the server's figure at fetch time + real time since --
  // wall-clock, so it stays right however throttled this tab's timers get.
  const elapsedSeconds = session.elapsedSeconds + Math.max(0, (now - session.fetchedAt) / 1000);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    // Re-sync the instant the tab becomes visible again (hidden tabs
    // throttle setInterval to about once a minute).
    function sync() {
      setNow(Date.now());
    }
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Coach-visible live status while the widget (rather than the modal) is
  // what's tracking this session.
  const heartbeatRef = useRef(() => {
    sendFocusHeartbeat().catch(() => {});
    heartbeatFocusSession(session.taskId).catch(() => {});
  });
  useEffect(() => {
    const beat = heartbeatRef.current;
    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const { due, confirm } = useStillStudyingPrompt(session.taskId, elapsedSeconds, true);

  async function handlePause() {
    setBusy(true);
    try {
      await pauseFocusSession(session.taskId);
      toast.success("Mola verildi. Devam etmek için görevdeki Süre Tut'a bas.");
      await onChanged();
    } catch {
      toast.error("Mola verilemedi, tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd(creditedSeconds?: number) {
    setBusy(true);
    try {
      const ended = await endFocusSession(session.taskId, creditedSeconds);
      if (!ended.ok) {
        toast.error(ended.error);
        return;
      }
      clearConfirmedMultiple(session.taskId);
      const savedSeconds = creditedSeconds ?? Math.round(elapsedSeconds);
      if (ended.pendingApproval) {
        toast.warning(`${formatClock(savedSeconds)} çok uzun olduğu için koç onayına gönderildi.`);
      } else if (savedSeconds > 0) {
        toast.success(`${formatClock(savedSeconds)} odaklandın, göreve kaydedildi.`);
      }
      await onChanged();
      router.refresh();
    } catch {
      toast.error("Odak süresi kaydedilemedi, tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  const remaining =
    session.mode === "countdown" && session.countdownTargetSeconds !== null
      ? Math.max(0, session.countdownTargetSeconds - elapsedSeconds)
      : null;

  return (
    <>
      <div className="border-border bg-card flex w-72 flex-col gap-2 rounded-lg border p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <Timer className="text-muted-foreground size-4 shrink-0" />
          <p className="text-foreground min-w-0 flex-1 truncate text-xs font-medium" title={session.taskTitle}>
            {session.taskTitle}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-foreground text-2xl font-bold tabular-nums">
              {formatClock(remaining ?? elapsedSeconds)}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {remaining !== null ? (remaining === 0 ? "Süre doldu" : "Geri sayım") : "Kronometre çalışıyor"}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={handlePause} disabled={busy}>
              <Pause className="size-3.5" />
              Mola
            </Button>
            <Button type="button" size="sm" onClick={() => handleEnd()} disabled={busy}>
              Bitir
            </Button>
          </div>
        </div>
      </div>

      {due && (
        <StillStudyingPrompt
          elapsedSeconds={elapsedSeconds}
          busy={busy}
          onConfirm={confirm}
          onEnd={(credited) => handleEnd(credited)}
        />
      )}
    </>
  );
}
