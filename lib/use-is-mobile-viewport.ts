"use client";

import { useEffect, useState } from "react";

// Matches Tailwind's md: breakpoint exactly, since this exists purely to
// let a Sidebar reconcile itself with the same breakpoint its own
// md:-prefixed classes already key off (see e.g. coach-sidebar.tsx) --
// below it, the sidebar renders as a full-width off-canvas drawer instead
// of the desktop icon rail.
const MOBILE_BREAKPOINT = 768;

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT));

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}
