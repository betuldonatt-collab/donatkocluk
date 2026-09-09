"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "stopwatch-widget-collapsed";
const CHANGE_EVENT = "stopwatch-widget-collapsed-changed";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
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
