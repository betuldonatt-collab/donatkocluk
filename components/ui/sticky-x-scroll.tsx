"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// A horizontally scrolling region whose scrollbar stays at the bottom of the SCREEN while any part of the region is visible.
//
// The native scrollbar of a wide, tall table sits at the table's own bottom edge, so a user in the middle of a long table had to scroll
// the whole page down just to reach it. Here the region's own scrollbar is hidden and a thin proxy scrollbar is rendered right after
// it with `position: sticky; bottom: 0`: it rests at the end of the region when that is on screen, and clings to the bottom of the
// viewport while the region continues below the fold. The two stay in sync (dragging the proxy scrolls the region, scrolling the region
// -- wheel, touch, keyboard, drag-and-drop auto-scroll -- moves the proxy). The page itself keeps scrolling normally: no nested
// vertical scroll area is introduced.
//
// Works for both kinds of content:
//   * a plain wide element (a grid with min-w-[...]): this component's own scroller scrolls;
//   * a shadcn <Table>, which brings its own `[data-slot="table-container"]` scroller (and the tables' sticky left columns depend on
//     it): that inner scroller is the one being proxied.
//
// NOTE: position: sticky is relative to the nearest scrolling ancestor, so html/body must not be scroll containers themselves --
// app/globals.css uses overflow-x: clip on body for exactly that reason.
export function StickyXScroll({
  children,
  className,
  scrollerClassName,
}: {
  children: React.ReactNode;
  // On the outer wrapper (the scroller and the proxy bar together).
  className?: string;
  // On the scroller itself (e.g. padding, a border).
  scrollerClassName?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });

  const getScroller = useCallback((): HTMLElement | null => {
    const outer = outerRef.current;
    if (!outer) return null;
    return outer.querySelector<HTMLElement>('[data-slot="table-container"]') ?? outer;
  }, []);

  const measure = useCallback(() => {
    const scroller = getScroller();
    if (!scroller) return;
    setMetrics((prev) =>
      prev.scrollWidth === scroller.scrollWidth && prev.clientWidth === scroller.clientWidth
        ? prev
        : { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth },
    );
  }, [getScroller]);

  // After every render: the content may have changed (rows added, columns shown) without the scroller's own box changing.
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });

  // ...and when something resizes without a render here (window, fonts, images, a collapsed section above).
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    const scroller = getScroller();
    if (scroller) {
      observer.observe(scroller);
      for (const child of Array.from(scroller.children)) observer.observe(child);
    }
    return () => observer.disconnect();
  }, [measure, getScroller]);

  const overflowing = metrics.scrollWidth - metrics.clientWidth > 1;

  // Keep the two scroll positions in step (assigning an equal value fires no event, so this cannot loop).
  useEffect(() => {
    const scroller = getScroller();
    const bar = barRef.current;
    if (!overflowing || !scroller || !bar) return;
    const fromScroller = () => {
      if (bar.scrollLeft !== scroller.scrollLeft) bar.scrollLeft = scroller.scrollLeft;
    };
    const fromBar = () => {
      if (scroller.scrollLeft !== bar.scrollLeft) scroller.scrollLeft = bar.scrollLeft;
    };
    fromScroller();
    scroller.addEventListener("scroll", fromScroller, { passive: true });
    bar.addEventListener("scroll", fromBar, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", fromScroller);
      bar.removeEventListener("scroll", fromBar);
    };
  }, [overflowing, getScroller]);

  return (
    <div className={className}>
      <div
        ref={outerRef}
        className={cn(
          "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[&_[data-slot=table-container]]:[scrollbar-width:none] [&_[data-slot=table-container]::-webkit-scrollbar]:hidden",
          scrollerClassName,
        )}
      >
        {children}
      </div>
      {overflowing && (
        <div
          ref={barRef}
          aria-hidden="true"
          tabIndex={-1}
          data-slot="sticky-x-scrollbar"
          className="bg-background/90 border-border sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden border-t [scrollbar-width:auto] print:hidden"
        >
          <div style={{ width: metrics.scrollWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
}
