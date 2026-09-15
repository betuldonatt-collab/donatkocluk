import { describe, expect, it } from "vitest";
import { autoCalcMissingField, computeAutoTaskStatus, countsAreConsistent, mergeDualTaskStatus } from "./count-fields";

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

describe("computeAutoTaskStatus", () => {
  it("is 'done' when solved meets the target exactly", () => {
    expect(computeAutoTaskStatus(50, 45, 3, 2)).toBe("done");
  });

  it("is 'done' when solved exceeds the target", () => {
    expect(computeAutoTaskStatus(50, 48, 3, 2)).toBe("done");
  });

  it("is 'done' within the 5-question tolerance (exactly 5 short)", () => {
    expect(computeAutoTaskStatus(50, 40, 3, 2)).toBe("done"); // solved 45, 5 short
  });

  it("is 'half_done' just past the tolerance (6 short)", () => {
    expect(computeAutoTaskStatus(50, 39, 3, 2)).toBe("half_done"); // solved 44, 6 short
  });

  it("is 'half_done' when far short of the target", () => {
    expect(computeAutoTaskStatus(50, 0, 0, 0)).toBe("half_done");
  });

  it("is null when there's no known target to compare against", () => {
    expect(computeAutoTaskStatus(null, 10, 2, 1)).toBeNull();
  });
});

describe("mergeDualTaskStatus", () => {
  it("is 'done' when both halves are done", () => {
    expect(mergeDualTaskStatus("done", "done")).toBe("done");
  });

  it("is 'half_done' when one half is done and the other half_done", () => {
    expect(mergeDualTaskStatus("done", "half_done")).toBe("half_done");
    expect(mergeDualTaskStatus("half_done", "done")).toBe("half_done");
  });

  it("is 'half_done' for the done+not_done exception, in either order", () => {
    expect(mergeDualTaskStatus("done", "not_done")).toBe("half_done");
    expect(mergeDualTaskStatus("not_done", "done")).toBe("half_done");
  });

  it("is 'half_done' when both halves are half_done", () => {
    expect(mergeDualTaskStatus("half_done", "half_done")).toBe("half_done");
  });

  it("is 'not_done' when one half is half_done and the other not_done", () => {
    expect(mergeDualTaskStatus("half_done", "not_done")).toBe("not_done");
    expect(mergeDualTaskStatus("not_done", "half_done")).toBe("not_done");
  });

  it("is 'not_done' when both halves are not_done", () => {
    expect(mergeDualTaskStatus("not_done", "not_done")).toBe("not_done");
  });
});
