"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "stopwatch-widget-collapsed";
const CHANGE_EVENT = "stopwatch-widget-collapsed-changed";
// Tailwind's own `sm` breakpoint -- below it counts as "mobile" for this
// widget's default-collapsed rule.
const MOBILE_QUERY = "(max-width: 639px)";

function readStored(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // No explicit choice yet: default collapsed on a mobile viewport (the
    // full details panel is too intrusive to auto-expand over a small
    // screen), expanded everywhere else -- same as before this change. The
    // moment the student taps it once, `toggle` below persists that literal
    // choice, and it's read back as-is on every viewport from then on.
    if (stored === null) return window.matchMedia(MOBILE_QUERY).matches;
    return stored === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot() {
  return false;
}

// Sibling copy of lib/use-announcements-widget-collapsed.ts, same
// deliberate-duplication reasoning: this widget needs its own independent
// collapsed/expanded state, storage key, and change event -- sharing the
// announcements widget's hook would collapse both together whenever
// either one is toggled, and both are meant to coexist on /student at once.
export function useStopwatchWidgetCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !readStored();
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Best-effort persistence only -- the toggle still works this session.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { collapsed, toggle };
}
