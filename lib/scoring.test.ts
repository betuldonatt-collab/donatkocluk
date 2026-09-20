import { describe, expect, it } from "vitest";
import { computeLgsNet, computeNet } from "./scoring";

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

describe("computeLgsNet", () => {
  it("subtracts a third of a point per wrong answer (3 wrong = 1 right)", () => {
    expect(computeLgsNet(20, 3)).toBe(19);
  });

  it("differs from the YKS rule for the same answers", () => {
    expect(computeLgsNet(10, 4)).toBe(8.67);
    expect(computeNet(10, 4)).toBe(9);
  });

  it("can go negative and rounds to 2 decimals", () => {
    expect(computeLgsNet(0, 6)).toBe(-2);
    expect(computeLgsNet(10, 1)).toBe(9.67);
  });
});
