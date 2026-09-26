"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-runs the current server page's data fetch while it is on screen, so a
// server-rendered dashboard (e.g. the parent's LGS Genel Deneme chart) picks up
// what the student just saved without a manual reload: every `intervalMs`, and
// immediately when the tab/app comes back to the foreground. router.refresh()
// keeps client state (scroll, open dialogs); it only re-renders the server
// parts. Pauses while the tab is hidden.
export function AutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
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
