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
