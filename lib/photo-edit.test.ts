import { describe, expect, it } from "vitest";

import { cropToPixels, dragCrop, FULL_CROP, isFullCrop, MIN_CROP, rotateBy, rotatedSize, type CropRect } from "./photo-edit";

describe("rotation", () => {
  it("steps by 90 degrees either way and wraps around", () => {
    expect(rotateBy(0, 90)).toBe(90);
    expect(rotateBy(270, 90)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
    expect(rotateBy(90, -90)).toBe(0);
    let r: 0 | 90 | 180 | 270 = 0;
    for (let i = 0; i < 4; i++) r = rotateBy(r, 90);
    expect(r).toBe(0);
  });

  it("swaps width and height for a quarter turn", () => {
    expect(rotatedSize(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
    expect(rotatedSize(4000, 3000, 90)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(4000, 3000, 180)).toEqual({ width: 4000, height: 3000 });
    expect(rotatedSize(4000, 3000, 270)).toEqual({ width: 3000, height: 4000 });
  });
});

describe("dragCrop", () => {
  const crop: CropRect = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

  it("moves the whole rectangle and keeps it inside the image", () => {
    expect(dragCrop(crop, "move", 0.1, -0.1)).toEqual({ x: 0.30000000000000004, y: 0.1, w: 0.5, h: 0.5 });
    const farRight = dragCrop(crop, "move", 5, 5);
    expect(farRight).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    const farLeft = dragCrop(crop, "move", -5, -5);
    expect(farLeft).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  it("an edge moves only that side", () => {
    const e = dragCrop(crop, "e", 0.1, 0.3);
    expect(e.x).toBe(0.2);
    expect(e.w).toBeCloseTo(0.6);
    expect(e.y).toBe(0.2);
    expect(e.h).toBeCloseTo(0.5);
    const n = dragCrop(crop, "n", 0, -0.1);
    expect(n.y).toBeCloseTo(0.1);
    expect(n.h).toBeCloseTo(0.6);
    expect(n.x).toBe(0.2);
    expect(n.w).toBeCloseTo(0.5);
  });

  it("a corner moves its two sides", () => {
    const sw = dragCrop(crop, "sw", -0.1, 0.1);
    expect(sw.x).toBeCloseTo(0.1);
    expect(sw.w).toBeCloseTo(0.6);
    expect(sw.y).toBeCloseTo(0.2);
    expect(sw.h).toBeCloseTo(0.6);
  });

  it("never leaves the image and never collapses below the minimum size", () => {
    const grown = dragCrop(crop, "se", 5, 5);
    expect(grown).toMatchObject({ x: 0.2, y: 0.2 });
    expect(grown.w).toBeCloseTo(0.8);
    expect(grown.h).toBeCloseTo(0.8);
    const grownNw = dragCrop(crop, "nw", -5, -5);
    expect(grownNw).toMatchObject({ x: 0, y: 0 });
    expect(grownNw.w).toBeCloseTo(0.7);
    expect(grownNw.h).toBeCloseTo(0.7);
    const squeezed = dragCrop(crop, "e", -5, 0);
    expect(squeezed.w).toBeCloseTo(MIN_CROP);
    expect(squeezed.x).toBe(0.2);
    const squeezedTop = dragCrop(crop, "s", 0, -5);
    expect(squeezedTop.h).toBeCloseTo(MIN_CROP);
  });

  it("does not mutate its input", () => {
    const copy = { ...crop };
    dragCrop(crop, "se", 0.1, 0.1);
    expect(crop).toEqual(copy);
  });
});

describe("cropToPixels / isFullCrop", () => {
  it("converts to whole pixels inside the image", () => {
    expect(cropToPixels({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 }, 1000, 2000)).toEqual({ sx: 250, sy: 200, sw: 500, sh: 1600 });
    expect(cropToPixels(FULL_CROP, 640, 480)).toEqual({ sx: 0, sy: 0, sw: 640, sh: 480 });
  });

  it("is at least one pixel and never reaches past the edge", () => {
    expect(cropToPixels({ x: 0.999, y: 0.999, w: 0.5, h: 0.5 }, 100, 100)).toEqual({ sx: 99, sy: 99, sw: 1, sh: 1 });
    const { sx, sw } = cropToPixels({ x: 0.5, y: 0, w: 0.9, h: 1 }, 101, 50);
    expect(sx + sw).toBeLessThanOrEqual(101);
  });

  it("recognises an untouched crop", () => {
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(false);
    expect(isFullCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
