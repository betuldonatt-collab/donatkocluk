"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "announcements-widget-collapsed";
const CHANGE_EVENT = "announcements-widget-collapsed-changed";

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

// Same useSyncExternalStore pattern as lib/use-sidebar-collapsed.ts (the
// left nav's own collapse toggle), deliberately duplicated rather than
// reused -- a shared hook would mean collapsing this widget also collapses
// the left sidebar, since useSidebarCollapsed's storage key/event are
// shared across all 4 dashboard shells on purpose. This one is scoped to
// just the announcements widget, on both the student and parent panels.
export function useAnnouncementsWidgetCollapsed() {
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
