"use client";

import { useEffect, useRef, useState } from "react";

export type RowHeights = {
  heightOf: (rowIndex: number) => number;
  onResize: (rowIndex: number, deltaY: number) => void;
  onResizeEnd: (rowIndex: number, rowCount: number) => void;
};

// Shared client-side state manager for an independent-per-row-height grid
// (see components/ui/resize-handle.tsx) -- both the coach's Rutinler and
// Görevler lanes and the student's own mirror each use one of these,
// entirely independent of each other (dragging a Rutinler row never
// touches Görevler's heights or vice versa).
//
// Purely local state during a drag for instant, per-pixel feedback with
// zero network chatter; the settled value is saved once per row on
// release, sending the WHOLE current array for that lane up to
// `rowCount` (the widest that lane currently is, passed in at call time
// since it can change as the coach navigates weeks or adds/removes
// rows) -- Postgres arrays have no convenient single-element update
// through the JS client, so this always resends the full array, padding
// any untouched index with `defaultHeight`. "Revert on failure" means
// reverting to whatever was last successfully SAVED, not the value at
// drag-start, since a user may drag the same handle several times in a
// row before a save actually resolves.
export function useRowHeights(
  initialHeights: number[],
  minHeight: number,
  defaultHeight: number,
  persist: (heights: number[]) => Promise<void>,
  onError: (message: string) => void,
): RowHeights {
  const [heights, setHeights] = useState<Record<number, number>>(() => {
    const record: Record<number, number> = {};
    initialHeights.forEach((h, i) => {
      record[i] = h;
    });
    return record;
  });
  const savedRef = useRef(heights);
  // Mirrors `heights` on every render so onResizeEnd can read the latest
  // value synchronously without going through a setState updater --
  // calling persist() (a Server Action, which touches router state
  // internally) from inside a setState updater is what caused "Cannot
  // update a component (Router) while rendering ScheduleBoard": React may
  // invoke an updater function during render/reconciliation, and a
  // Server Action call has no business running in that context. Updaters
  // must stay pure; persist() now only ever runs from onResizeEnd's own
  // body, a plain event-handler call, never from inside setHeights itself.
  const heightsRef = useRef(heights);
  useEffect(() => {
    heightsRef.current = heights;
  }, [heights]);

  function heightOf(rowIndex: number): number {
    return heights[rowIndex] ?? defaultHeight;
  }

  function onResize(rowIndex: number, deltaY: number) {
    // Rounded right here, the single place `heights` ever gets written --
    // a real PointerEvent's clientY can be fractional (subpixel mouse
    // position, devicePixelRatio scaling), so an unrounded deltaY drifts
    // the accumulated height off-integer immediately. Rounding once per
    // accumulation (not per pixel of on-screen movement) avoids compounding
    // error from many small fractional deltas, and keeps every downstream
    // consumer -- the CSS px style, and rowHeightsSchema's z.number().int()
    // in lib/schedule-row-heights.ts -- looking at a real integer the
    // whole time, not just at the moment it's persisted.
    setHeights((prev) => ({ ...prev, [rowIndex]: Math.max(minHeight, Math.round((prev[rowIndex] ?? defaultHeight) + deltaY)) }));
  }

  function onResizeEnd(rowIndex: number, rowCount: number) {
    const current = heightsRef.current;
    const clamped = Math.max(minHeight, current[rowIndex] ?? defaultHeight);
    const next = { ...current, [rowIndex]: clamped };
    if (clamped !== current[rowIndex]) setHeights(next);

    const array = Array.from({ length: rowCount }, (_, i) => next[i] ?? defaultHeight);
    persist(array)
      .then(() => {
        savedRef.current = next;
      })
      .catch((e) => {
        setHeights(savedRef.current);
        onError(e instanceof Error ? e.message : "Satır yüksekliği kaydedilemedi.");
      });
  }

  return { heightOf, onResize, onResizeEnd };
}
