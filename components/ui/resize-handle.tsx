"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

// Generic "drag this edge to resize" strip -- pure pointer-event math, no
// panel-specific logic, so it lives once here (like Button, Popover)
// rather than duplicated per panel. Reports live deltaY during the drag
// via onResize (for instant, per-pixel visual feedback with zero network
// chatter mid-drag), then onResizeEnd once on release, which is the
// caller's cue to persist whatever value it landed on. Doesn't own or
// clamp the value itself -- callers decide their own min/max policy (this
// app's callers enforce a floor, deliberately no ceiling).
//
// Uses pointer capture (not document-level listeners) so drag events keep
// reaching this element even when the pointer moves faster than the
// cursor's hit-test, or leaves the element/window entirely mid-drag.
export function ResizeHandle({
  onResize,
  onResizeEnd,
  label,
  className,
}: {
  onResize: (deltaY: number) => void;
  onResizeEnd: () => void;
  label: string;
  className?: string;
}) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  // setPointerCapture/releasePointerCapture can throw (NotFoundError) when
  // there's no genuine active pointer of that id to capture -- this is a
  // real, if rare, occurrence with touch/pen input if the pointer gets
  // cancelled mid-drag, not just a synthetic-event quirk. Wrapped so a
  // throw here can never suppress the end-of-drag bookkeeping below it --
  // onResizeEnd firing is what actually persists the drag, so it must run
  // unconditionally once a drag that started is finishing, capture or not.
  function tryCapture(el: HTMLDivElement, pointerId: number, release: boolean) {
    try {
      if (release) el.releasePointerCapture(pointerId);
      else el.setPointerCapture(pointerId);
    } catch {
      // No active pointer to (re)capture -- the drag still proceeds via
      // plain pointermove/pointerup bubbling, just without the extra
      // reliability capture would have given it.
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    lastY.current = e.clientY;
    tryCapture(e.currentTarget, e.pointerId, false);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const deltaY = e.clientY - lastY.current;
    lastY.current = e.clientY;
    if (deltaY !== 0) onResize(deltaY);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    tryCapture(e.currentTarget, e.pointerId, true);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    onResizeEnd();
  }

  return (
    <div
      // Mouse/touch-drag only -- tabIndex={-1} and no key handler, so
      // there's no keyboard equivalent to offer. aria-hidden rather than a
      // slider/separator role: presenting this as a focusable control to
      // assistive tech would promise interaction it can't actually
      // deliver. title gives sighted pointer users a hint on hover.
      aria-hidden
      tabIndex={-1}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      // A dragging pointer can be cancelled by the browser (e.g. a touch
      // interrupted by a system gesture) without ever firing pointerup --
      // without this, that drag would just be silently lost: the height
      // never persists, and dragging.current stays stuck true forever.
      onPointerCancel={endDrag}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize touch-none rounded-b-md opacity-0 transition-opacity hover:opacity-100 hover:bg-primary/40 active:opacity-100 active:bg-primary/50",
        className,
      )}
    />
  );
}
