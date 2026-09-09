import { describe, expect, it } from "vitest";
import { computeNet } from "./scoring";

describe("computeNet", () => {
  it("subtracts a quarter-point per wrong answer", () => {
    expect(computeNet(20, 4)).toBe(19);
  });

  it("returns the full correct count when there are no wrong answers", () => {
    expect(computeNet(15, 0)).toBe(15);
  });

  it("can go negative when wrong answers dominate", () => {
    expect(computeNet(0, 8)).toBe(-2);
  });

  it("rounds to 2 decimal places", () => {
    expect(computeNet(10, 1)).toBe(9.75);
    expect(computeNet(10, 3)).toBe(9.25);
  });
});
