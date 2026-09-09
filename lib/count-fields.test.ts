import { describe, expect, it } from "vitest";
import { autoCalcMissingField, countsAreConsistent } from "./count-fields";

describe("autoCalcMissingField", () => {
  it("derives total from correct + wrong + empty", () => {
    expect(autoCalcMissingField({ total: null, correct: 30, wrong: 5, empty: 2 })).toEqual({ total: 37 });
  });

  it("derives correct from total - wrong - empty", () => {
    expect(autoCalcMissingField({ total: 40, correct: null, wrong: 5, empty: 2 })).toEqual({ correct: 33 });
  });

  it("derives wrong from total - correct - empty", () => {
    expect(autoCalcMissingField({ total: 40, correct: 30, wrong: null, empty: 2 })).toEqual({ wrong: 8 });
  });

  it("derives empty from total - correct - wrong", () => {
    expect(autoCalcMissingField({ total: 40, correct: 30, wrong: 5, empty: null })).toEqual({ empty: 5 });
  });

  it("clamps a negative derived addend to 0", () => {
    expect(autoCalcMissingField({ total: 10, correct: 30, wrong: null, empty: 2 })).toEqual({ wrong: 0 });
  });

  it("returns {} when fewer than 3 fields are filled", () => {
    expect(autoCalcMissingField({ total: null, correct: 30, wrong: null, empty: null })).toEqual({});
    expect(autoCalcMissingField({ total: null, correct: null, wrong: null, empty: null })).toEqual({});
  });

  it("returns {} when all 4 fields are already filled", () => {
    expect(autoCalcMissingField({ total: 37, correct: 30, wrong: 5, empty: 2 })).toEqual({});
  });
});

describe("countsAreConsistent", () => {
  it("is true when total equals correct + wrong + empty", () => {
    expect(countsAreConsistent({ total: 37, correct: 30, wrong: 5, empty: 2 })).toBe(true);
  });

  it("is false when all 4 are filled but the equation doesn't hold", () => {
    expect(countsAreConsistent({ total: 40, correct: 30, wrong: 5, empty: 2 })).toBe(false);
  });

  it("is true when fewer than 4 fields are filled -- nothing to check yet", () => {
    expect(countsAreConsistent({ total: null, correct: 30, wrong: 5, empty: 2 })).toBe(true);
    expect(countsAreConsistent({ total: null, correct: null, wrong: null, empty: null })).toBe(true);
  });

  it("is true for the all-zero case", () => {
    expect(countsAreConsistent({ total: 0, correct: 0, wrong: 0, empty: 0 })).toBe(true);
  });
});
