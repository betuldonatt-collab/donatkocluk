"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// Re-runs the current server page's data fetch while it is on screen, so a
// server-rendered dashboard (e.g. the parent's LGS Genel Deneme chart) picks up
// what the student just saved without a manual reload: every `intervalMs`, and
// immediately when the tab/app comes back to the foreground. router.refresh()
// keeps client state (scroll, open dialogs); it only re-renders the server
// parts. Pauses while the tab is hidden, and a return to the tab refreshes at
// most once per MIN_GAP_MS (visibilitychange and focus often fire together).
// A student switch (or any other navigation the app starts itself) pauses the
// refresh so the two never compete for the server: call pauseAutoRefresh() when
// it starts and resumeAutoRefresh() when it is done (a safety timeout releases
// the pause on its own).
let pausedUntil = 0;
export function pauseAutoRefresh(maxMs = 30_000) {
  pausedUntil = Date.now() + maxMs;
}
export function resumeAutoRefresh() {
  pausedUntil = 0;
}

const MIN_GAP_MS = 15_000;

export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A refresh still in flight is never stacked with another one.
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const lastRef = useRef(0);

  useEffect(() => {
    // The page was just rendered: a focus event right after load is not a reason to refresh.
    lastRef.current = Date.now();
    const refresh = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || pendingRef.current || now < pausedUntil || now - lastRef.current < MIN_GAP_MS) return;
      lastRef.current = now;
      startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
