// Tiny external store answering one question for the floating focus-session
// widget: "is the fullscreen Focus Timer modal mounted right now?". While it
// is, the widget hides (the modal already shows the same timer); when it
// unmounts -- the student navigated away, or finished -- the widget takes
// over so a session that is still running keeps being visible and
// controllable. A counter (not a boolean) so overlapping mounts, such as
// React Strict Mode's mount/unmount/mount in dev, stay balanced.

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const focusModalStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => openCount,
  getServerSnapshot: () => 0,
  opened() {
    openCount += 1;
    emit();
  },
  closed() {
    openCount = Math.max(0, openCount - 1);
    emit();
  },
};

// Sessions whose "Bitir" has been clicked and whose save is still in flight.
// Bitir is optimistic: the timer disappears the instant it is clicked and the
// server call finishes in the background -- so the floating widget must not
// keep showing (or briefly re-show) a session that is being ended. The widget
// hides these ids, and re-reads the server when the set changes (which brings
// the session back if the save failed, so it can be ended again).
const ending = new Set<string>();
const endingListeners = new Set<() => void>();

function emitEnding() {
  for (const listener of endingListeners) listener();
}

export const focusEndingStore = {
  subscribe(listener: () => void) {
    endingListeners.add(listener);
    return () => {
      endingListeners.delete(listener);
    };
  },
  // A primitive snapshot (comma-joined ids) so useSyncExternalStore compares it
  // by value.
  getSnapshot: () => [...ending].sort().join(","),
  getServerSnapshot: () => "",
  begin(taskId: string) {
    ending.add(taskId);
    emitEnding();
  },
  end(taskId: string) {
    ending.delete(taskId);
    emitEnding();
  },
};

export type OptimisticFocusSession = {
  taskId: string;
  taskTitle: string;
  mode: "stopwatch" | "countdown";
  countdownTargetSeconds: number | null;
  elapsedSeconds: number;
  fetchedAt: number;
};

// A just-started-or-just-backgrounded session, pushed here by the fullscreen
// timer the instant it closes while still running ("Arka planda çalışsın",
// X, Escape). The floating widget (active-focus-session-widget.tsx) shows it
// immediately from this, instead of waiting on its own server round trip
// (getRunningFocusSessions) -- that fetch fires off the SAME modalOpen
// transition and can race the write that created the session (see its own
// 2s blind-retry comment), which is what left the widget empty for a few
// seconds after backgrounding a freshly-started timer. Superseded the
// moment that fetch actually confirms the session (the widget clears it
// then), and auto-clears itself after a generous timeout as a safety net if
// that confirmation never arrives (e.g. the write genuinely failed).
const OPTIMISTIC_SESSION_TIMEOUT_MS = 15_000;
let optimisticSession: OptimisticFocusSession | null = null;
let optimisticClearTimer: ReturnType<typeof setTimeout> | null = null;
const optimisticListeners = new Set<() => void>();

function emitOptimistic() {
  for (const listener of optimisticListeners) listener();
}

function clearOptimisticTimer() {
  if (optimisticClearTimer) {
    clearTimeout(optimisticClearTimer);
    optimisticClearTimer = null;
  }
}

export const focusOptimisticSessionStore = {
  subscribe(listener: () => void) {
    optimisticListeners.add(listener);
    return () => {
      optimisticListeners.delete(listener);
    };
  },
  getSnapshot: () => optimisticSession,
  getServerSnapshot: () => null,
  set(session: OptimisticFocusSession) {
    optimisticSession = session;
    clearOptimisticTimer();
    optimisticClearTimer = setTimeout(() => {
      optimisticSession = null;
      emitOptimistic();
    }, OPTIMISTIC_SESSION_TIMEOUT_MS);
    emitOptimistic();
  },
  // taskId omitted clears whatever is currently held, no matter which task.
  clear(taskId?: string) {
    if (optimisticSession && (!taskId || optimisticSession.taskId === taskId)) {
      optimisticSession = null;
      clearOptimisticTimer();
      emitOptimistic();
    }
  },
};
