"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "sidebar-collapsed";
const CHANGE_EVENT = "sidebar-collapsed-changed";

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

// Shared across all 4 dashboard shells (admin/coach/student/parent) so the
// collapse preference is one persistent setting, not four independent
// ones. Reads via useSyncExternalStore rather than useState+useEffect --
// localStorage is external, synchronous state, and this is the pattern
// React itself recommends for exactly that: it avoids both the
// hydration-mismatch trap of reading localStorage during the initial
// render (server has none) and the "setState synchronously in an effect"
// anti-pattern a manual useEffect version would trigger. The dispatched
// CHANGE_EVENT covers same-tab re-renders (the native "storage" event
// only fires in *other* tabs); listening for "storage" too means a
// toggle in one tab is reflected in any other open tab as well.
export function useSidebarCollapsed() {
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
