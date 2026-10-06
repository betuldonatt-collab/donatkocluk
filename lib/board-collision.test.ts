import { closestCorners, type CollisionDetection } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { boardCollisionDetection } from "./board-collision";

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };
const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height, right: left + width, bottom: top + height });

// The board's real geometry: every day column is padded out (empty placeholder rows) to the height of the busiest day, so
// ALL seven columns are as tall as the day holding 25 stacked cards (Wednesday, index 2). The other days hold only a card
// or two at the top; the rest of their column is empty padding.
const ROW = 105;
const COLUMN_HEIGHT = 30 + 25 * ROW;
function board() {
  const rects = new Map<string, Rect>();
  const containers: { id: string; key: string; data: { current: undefined }; node: { current: null }; rect: { current: Rect }; disabled: boolean }[] = [];
  const add = (id: string, r: Rect) => {
    rects.set(id, r);
    containers.push({ id, key: id, data: { current: undefined }, node: { current: null }, rect: { current: r }, disabled: false });
  };
  for (let d = 0; d < 7; d++) add(`day:2026-10-${String(12 + d).padStart(2, "0")}`, rect(d * 210, 0, 200, COLUMN_HEIGHT));
  for (let i = 0; i < 25; i++) add(`wed-card-${i}`, rect(2 * 210 + 5, 30 + i * ROW, 190, 100));
  for (let i = 0; i < 2; i++) add(`thu-card-${i}`, rect(3 * 210 + 5, 30 + i * ROW, 190, 100));
  return { rects, containers };
}

function detect(fn: CollisionDetection, pointer: { x: number; y: number }) {
  const { rects, containers } = board();
  return fn({
    active: { id: "wed-card-14", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    // the dragged card follows the pointer, held by its middle
    collisionRect: rect(pointer.x - 95, pointer.y - 50, 190, 100),
    droppableRects: rects as never,
    droppableContainers: containers as never,
    pointerCoordinates: pointer,
  }).map((c) => String(c.id));
}

// Wednesday's 15th card is dragged to the empty padded part of Thursday's column, level with where it was picked up.
const OVER_EMPTY_THURSDAY = { x: 3 * 210 + 100, y: 30 + 14 * ROW + 50 };

describe("boardCollisionDetection", () => {
  it("(the bug) closestCorners alone resolves a drop on the empty part of the next day to a card of the packed day", () => {
    expect(detect(closestCorners, OVER_EMPTY_THURSDAY)[0]).toMatch(/^wed-card-/);
  });

  it("drops onto the day the pointer is over, however packed the day the card came from is", () => {
    expect(detect(boardCollisionDetection, OVER_EMPTY_THURSDAY)[0]).toBe("day:2026-10-15");
  });

  it("works for every other day of the week too", () => {
    for (const day of [0, 1, 3, 4, 5, 6]) {
      const id = `day:2026-10-${String(12 + day).padStart(2, "0")}`;
      expect(detect(boardCollisionDetection, { x: day * 210 + 100, y: 30 + 14 * ROW + 50 })[0], id).toBe(id);
    }
  });

  it("a card under the pointer wins over its column, so the drop lands at that position", () => {
    expect(detect(boardCollisionDetection, { x: 3 * 210 + 100, y: 30 + 105 + 50 })[0]).toBe("thu-card-1");
    expect(detect(boardCollisionDetection, { x: 2 * 210 + 100, y: 30 + 4 * ROW + 50 })[0]).toBe("wed-card-4");
  });

  it("with the pointer over nothing (in the gap between columns, outside the board) it still resolves to something near", () => {
    expect(detect(boardCollisionDetection, { x: 9999, y: 50 }).length).toBeGreaterThan(0);
    expect(detect(boardCollisionDetection, { x: 205, y: 500 }).length).toBeGreaterThan(0); // the 10px gap between Mon and Tue
  });
});
