"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
// Re-measures whenever `deps` changes (new week, edited fixed tasks); does not
// track container-width-driven reflow (a sidebar toggle re-wrapping a
// description) since that's a rare, low-stakes case not worth a ResizeObserver
// here -- the next data change (or a manual refresh) re-syncs it regardless.
export function useAutoRowHeights(rowCount: number, deps: unknown[]): {
  heights: number[];
  registerRef: (rowIndex: number, columnKey: string) => (el: HTMLDivElement | null) => void;
} {
  const nodesRef = useRef<Map<string, HTMLDivElement>[]>([]);
  const [heights, setHeights] = useState<number[]>([]);

  useLayoutEffect(() => {
    while (nodesRef.current.length < rowCount) nodesRef.current.push(new Map());
    nodesRef.current.length = rowCount;

    const measurements = nodesRef.current.flatMap((row, rowIndex) =>
      [...row.values()].map((el) => ({ row: rowIndex, height: el.getBoundingClientRect().height })),
    );
    setHeights(maxHeightsByRow(measurements, rowCount));
    // `deps` covers every value that could change a chip's real content (and
    // therefore its natural height); rowCount is included explicitly since it's
    // not always one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount, ...deps]);

  function registerRef(rowIndex: number, columnKey: string) {
    return (el: HTMLDivElement | null) => {
      const row = (nodesRef.current[rowIndex] ??= new Map());
      if (el) row.set(columnKey, el);
      else row.delete(columnKey);
    };
  }

  return { heights, registerRef };
}
