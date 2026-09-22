// Pure half of useAutoRowHeights (lib/use-auto-row-heights.ts): given each
// element actually measured at a (row, column) position, the height every
// column's slot at that row must reserve -- the tallest one found there.
// Extracted so it's testable without a DOM (getBoundingClientRect needs real
// layout, which jsdom doesn't compute).
export function maxHeightsByRow(measurements: { row: number; height: number }[], rowCount: number): number[] {
  const heights = new Array<number>(rowCount).fill(0);
  for (const { row, height } of measurements) {
    if (row < 0 || row >= rowCount) continue;
    if (height > heights[row]) heights[row] = height;
  }
  return heights.map((h) => Math.ceil(h));
}
