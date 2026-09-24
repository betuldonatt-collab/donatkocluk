"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { maxHeightsByRow } from "./auto-row-heights";

// Keeps a read-only, per-row-index grid lined up across N independent columns
// WITHOUT a coach dragging anything (see lib/use-row-heights.ts for that
// draggable version, used by the Rutinler/Görevler lanes) -- built for the
// schedule board's "Sabit Görevler" chips, whose content (and hence natural
// height) varies day to day and can't be resized by hand. Each real chip
// registers its own DOM node via `registerRef(rowIndex, columnKey)`; every
// render, this measures all of them and reports the tallest one found at each
// row index, so every column's slot at that row -- real chip or empty
// placeholder -- can reserve the exact same height and the section below
// (Rutinler) starts at the same Y in every column.
//
// Re-measures whenever `deps` changes (new week, edited fixed tasks) AND
// whenever a chip's width changes (see the ResizeObserver below).
export function useAutoRowHeights(rowCount: number, deps: unknown[]): {
  heights: number[];
  registerRef: (rowIndex: number, columnKey: string) => (el: HTMLDivElement | null) => void;
} {
  const nodesRef = useRef<Map<string, HTMLDivElement>[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const rowCountRef = useRef(rowCount);

  // Measures every registered chip at its NATURAL height. The chips carry the
  // reserved row height as an inline min-height, so it is cleared for the
  // duration of the read -- otherwise a previously-reserved height would
  // measure as "natural" and rows could only ever grow, never shrink back
  // (e.g. after a wider layout lets descriptions wrap onto fewer lines).
  // Done synchronously, so nothing is painted in the cleared state.
  const measure = useCallback(() => {
    const measurements = nodesRef.current.flatMap((row, rowIndex) =>
      [...row.values()].map((el) => {
        const previous = el.style.minHeight;
        el.style.minHeight = "0px";
        const height = el.getBoundingClientRect().height;
        el.style.minHeight = previous;
        return { row: rowIndex, height };
      }),
    );
    setHeights((prev) => {
      const next = maxHeightsByRow(measurements, rowCountRef.current);
      return prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next;
    });
  }, []);

  useLayoutEffect(() => {
    rowCountRef.current = rowCount;
    while (nodesRef.current.length < rowCount) nodesRef.current.push(new Map());
    nodesRef.current.length = rowCount;
    measure();
    // `deps` covers every value that could change a chip's real content (and
    // therefore its natural height); rowCount is included explicitly since it's
    // not always one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount, ...deps]);

  // Column WIDTH changes (sidebar expand/collapse, window resize, rotating a
  // phone) re-wrap the chips' text without touching any data, so the row
  // heights measured above go stale and neighbouring columns drift out of
  // line. Re-measure when any chip's width actually changes -- width only,
  // so the height changes this hook itself causes can never re-trigger it.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const widths = new WeakMap<Element, number>();
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (widths.get(entry.target) !== w) {
          widths.set(entry.target, w);
          changed = true;
        }
      }
      if (changed) measure();
    });
    for (const row of nodesRef.current) for (const el of row.values()) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, rowCount, ...deps]);

  function registerRef(rowIndex: number, columnKey: string) {
    return (el: HTMLDivElement | null) => {
      const row = (nodesRef.current[rowIndex] ??= new Map());
      if (el) row.set(columnKey, el);
      else row.delete(columnKey);
    };
  }

  return { heights, registerRef };
}
