import { describe, expect, it } from "vitest";

import { pastelGreenForProgress, pastelGreenForStreakDot, pastelGreenStepForProgress } from "./progress-colors";

describe("pastelGreenStepForProgress", () => {
  it("buckets 0-100% into 5 steps of 20 points each", () => {
    expect(pastelGreenStepForProgress(0)).toBe(0);
    expect(pastelGreenStepForProgress(19)).toBe(0);
    expect(pastelGreenStepForProgress(20)).toBe(1);
    expect(pastelGreenStepForProgress(39)).toBe(1);
    expect(pastelGreenStepForProgress(40)).toBe(2);
    expect(pastelGreenStepForProgress(59)).toBe(2);
    expect(pastelGreenStepForProgress(60)).toBe(3);
    expect(pastelGreenStepForProgress(79)).toBe(3);
    expect(pastelGreenStepForProgress(80)).toBe(4);
    expect(pastelGreenStepForProgress(100)).toBe(4);
  });

  it("clamps out-of-range input instead of indexing past the step table", () => {
    expect(pastelGreenStepForProgress(-10)).toBe(0);
    expect(pastelGreenStepForProgress(150)).toBe(4);
  });
});

describe("pastelGreenForProgress", () => {
  it("darkens (lightness decreases) as progress climbs, step by step", () => {
    // hsl(142 <saturation>% <lightness>% / <alpha>) -- the lightness is the
    // percentage immediately before " / <alpha>)".
    const lightnessOf = (color: string) => Number(color.match(/(\d+)%\s*\/\s*[\d.]+\)$/)?.[1]);
    const lightnesses = [0, 20, 40, 60, 80].map((pct) => lightnessOf(pastelGreenForProgress(pct)));
    for (let i = 1; i < lightnesses.length; i++) {
      expect(lightnesses[i]).toBeLessThan(lightnesses[i - 1]);
    }
  });

  it("never leaves the pastel range (saturation stays moderate) even at full progress", () => {
    const saturation = Number(pastelGreenForProgress(100).match(/hsl\(\d+ (\d+)%/)?.[1]);
    expect(saturation).toBeLessThanOrEqual(50);
  });

  it("applies the requested alpha without changing the hue/lightness step", () => {
    expect(pastelGreenForProgress(50, 0.08)).toMatch(/\/ 0\.08\)$/);
    expect(pastelGreenForProgress(50, 0.08).replace("0.08", "1")).toBe(pastelGreenForProgress(50));
  });
});

describe("pastelGreenForStreakDot", () => {
  const lightnessOf = (color: string) => Number(color.match(/(\d+)%\s*\/\s*[\d.]+\)$/)?.[1]);

  it("darkens from the first dot to the last", () => {
    const dots = [0, 1, 2].map((i) => lightnessOf(pastelGreenForStreakDot(i, 3)));
    expect(dots[0]).toBeGreaterThan(dots[1]);
    expect(dots[1]).toBeGreaterThan(dots[2]);
  });

  it("the last dot always lands on the deepest step, same as a fully-complete bar", () => {
    expect(pastelGreenForStreakDot(2, 3)).toBe(pastelGreenForProgress(100));
  });

  it("the first dot is clearly visible, not a barely-there near-white tint", () => {
    // A single small dot has far less surface area than a wide progress
    // bar -- its lightest step must stay noticeably darker than the bar's
    // own 0-20% bucket (lightnessOf(pastelGreenForProgress(0)) = 88), or
    // the "1st step achieved" dot reads as unfilled.
    expect(lightnessOf(pastelGreenForStreakDot(0, 3))).toBeLessThanOrEqual(75);
  });

  it("still never leaves the pastel range (moderate saturation) at any dot", () => {
    const saturationOf = (color: string) => Number(color.match(/hsl\(\d+ (\d+)%/)?.[1]);
    for (const i of [0, 1, 2]) {
      expect(saturationOf(pastelGreenForStreakDot(i, 3))).toBeLessThanOrEqual(50);
    }
  });
});
