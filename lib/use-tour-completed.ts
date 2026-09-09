"use client";

import { useCallback, useSyncExternalStore } from "react";

function storageKey(role: string): string {
  return `donat_tour_completed_${role}`;
}

function changeEvent(role: string): string {
  return `donat-tour-completed-changed:${role}`;
}

function readStored(role: string): boolean {
  try {
    return localStorage.getItem(storageKey(role)) === "1";
  } catch {
    return false;
  }
}

// One hook parameterized by role rather than four separate files (unlike
// e.g. use-stopwatch-widget-collapsed.ts vs.
// use-coach-stopwatch-widget-collapsed.ts, which are genuinely unrelated
// keys) -- donat_tour_completed_{role} is one templated key shape shared
// by all four panels, so a parameter is the natural fit here.
//
// Reads via useSyncExternalStore, same reasoning as useSidebarCollapsed:
// localStorage is external, synchronous state, so this avoids both the
// hydration-mismatch trap of reading it during the initial render (the
// server has none) and the "setState synchronously in an effect"
// anti-pattern a manual useEffect version would hit. getServerSnapshot
// deliberately returns `true` (completed) rather than `false` -- the very
// first paint (server + first client render, before hydration can check
// the real value) should never assume "never seen," or the tour would
// flash open on every single page load before localStorage has actually
// been checked. Once hydrated, useSyncExternalStore re-syncs to the real
// value and the auto-open effect (see TourTrigger in
// components/ui/platform-tour.tsx) fires normally if it's genuinely the
// first visit.
function getServerSnapshot(): boolean {
  return true;
}

export function useTourCompleted(role: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const event = changeEvent(role);
      window.addEventListener(event, callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener(event, callback);
        window.removeEventListener("storage", callback);
      };
    },
    [role],
  );
  const getSnapshot = useCallback(() => readStored(role), [role]);

  const completed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(storageKey(role), "1");
    } catch {
      // Best-effort persistence only -- the tour still closes this session.
    }
    window.dispatchEvent(new Event(changeEvent(role)));
  }, [role]);

  return { completed, markCompleted };
}
