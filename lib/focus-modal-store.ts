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

// Sessions whose "Bitir" OR "Mola" has just been clicked and whose save is
// still in flight. Both are optimistic: the card disappears the instant
// either button is clicked and the server call finishes in the background --
// so the floating widget must not keep showing (or briefly re-show) a
// session that is being ended or paused (either way it's about to stop being
// "running", which is all this widget ever shows). The widget hides these
// ids immediately, and only reveals a taskId again once a FRESH read has
// actually confirmed the outcome (see ActiveFocusSessionWidget's own
// "settling" logic) -- which is also what brings a session back if its save
// failed, so it can be ended/paused again.
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
  // Always "running": this is only ever set when the fullscreen timer closes
  // WHILE running (see the comment below) -- a paused close never reaches here.
  status: "running";
  elapsedSeconds: number;
  // Seconds already banked on this task from earlier, already-ended
  // sessions -- same field/purpose as RunningFocusSession's own, kept in
  // sync here so the widget's displayed clock doesn't jump the moment the
  // real server read supersedes this optimistic entry.
  priorTrackedSeconds: number;
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

// Sessions whose Bitir FAILED for good (every automatic retry included). The
// session is still running on the server, so the floating widget shows its card
// in a red "Kaydedilemedi" state with a "Tekrar dene" button instead of
// quietly going back to looking like an ordinary running timer. `credited` is
// the shortened figure from the "still studying?" check-in, if that is how it
// was ended, so the retry ends it the same way.
const failedEnd = new Map<string, { credited?: number }>();
const failedEndListeners = new Set<() => void>();

function emitFailedEnd() {
  for (const listener of failedEndListeners) listener();
}

export const focusFailedEndStore = {
  subscribe(listener: () => void) {
    failedEndListeners.add(listener);
    return () => {
      failedEndListeners.delete(listener);
    };
  },
  // Comma-joined ids: a primitive snapshot so useSyncExternalStore compares by value.
  getSnapshot: () => [...failedEnd.keys()].sort().join(","),
  getServerSnapshot: () => "",
  credited: (taskId: string) => failedEnd.get(taskId)?.credited,
  set(taskId: string, credited?: number) {
    failedEnd.set(taskId, { credited });
    emitFailedEnd();
  },
  clear(taskId: string) {
    if (failedEnd.delete(taskId)) emitFailedEnd();
  },
};
