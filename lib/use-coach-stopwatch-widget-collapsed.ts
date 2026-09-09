"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "coach-stopwatch-widget-collapsed";
const CHANGE_EVENT = "coach-stopwatch-widget-collapsed-changed";

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

// Coach-panel sibling of lib/use-stopwatch-widget-collapsed.ts (the
// student one) -- its own storage key/event so it doesn't cross-toggle
// with any other widget sharing this coach panel (the announcements
// side widget), matching the one-hook-per-widget convention.
export function useCoachStopwatchWidgetCollapsed() {
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
