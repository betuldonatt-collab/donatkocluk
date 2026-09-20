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
