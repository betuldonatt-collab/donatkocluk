import { describe, expect, it } from "vitest";
import { maxHeightsByRow } from "./auto-row-heights";

describe("maxHeightsByRow", () => {
  it("takes the tallest measurement at each row, across however many columns reported one", () => {
    const heights = maxHeightsByRow(
      [
        { row: 0, height: 40 },
        { row: 0, height: 88 }, // a longer description on another day, same row
        { row: 1, height: 40 },
      ],
      2,
    );
    expect(heights).toEqual([88, 40]);
  });

  it("is 0 for a row nothing reported (no day has a fixed task at that index)", () => {
    expect(maxHeightsByRow([{ row: 2, height: 40 }], 3)).toEqual([0, 0, 40]);
  });

  it("ignores an out-of-range row instead of throwing", () => {
    expect(maxHeightsByRow([{ row: 5, height: 40 }], 2)).toEqual([0, 0]);
  });

  it("rounds up fractional pixel heights", () => {
    expect(maxHeightsByRow([{ row: 0, height: 39.2 }], 1)).toEqual([40]);
  });

  it("is empty for rowCount 0", () => {
    expect(maxHeightsByRow([{ row: 0, height: 40 }], 0)).toEqual([]);
  });
});
