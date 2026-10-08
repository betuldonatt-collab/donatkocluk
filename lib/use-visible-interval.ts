"use client";

import { useEffect, useRef } from "react";

// setInterval that only fires while the tab is visible, and fires once straight away when the tab comes back. A poll whose
// result nobody can see (a background tab) is a Server Action round trip -- auth, queries, serialisation -- for nothing; with
// many tabs left open all day those add up. The effect is invisible: what is on screen is as fresh as before, and a tab that
// returns to the foreground refreshes immediately instead of waiting out the rest of an interval.
export function useVisibleInterval(callback: () => void, intervalMs: number, enabled = true) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs, enabled]);
}
