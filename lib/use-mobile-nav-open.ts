"use client";

import { useCallback, useSyncExternalStore } from "react";

// Whether the mobile off-canvas sidebar drawer is open. Same
// useSyncExternalStore shape as useSidebarCollapsed (both DashboardShell
// and whichever Sidebar it wraps call this independently and stay in
// sync with no lifted state -- see dashboard-shell.tsx's own comment on
// why), but deliberately in-memory only, NOT persisted to localStorage:
// a mobile drawer should always start closed on a fresh page load or
// navigation, never remember having been left open in a previous
// session.
let isOpen = false;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return isOpen;
}

function getServerSnapshot(): boolean {
  return false;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function useMobileNavOpen() {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setOpen = useCallback((next: boolean) => {
    isOpen = next;
    notify();
  }, []);

  const toggle = useCallback(() => {
    isOpen = !isOpen;
    notify();
  }, []);

  return { open, setOpen, toggle };
}
