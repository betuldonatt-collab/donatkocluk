import { describe, expect, it } from "vitest";

import { isLgsParentView } from "./parent-lgs";

describe("isLgsParentView", () => {
  it("is true only for LGS", () => {
    expect(isLgsParentView("LGS")).toBe(true);
    expect(isLgsParentView("YKS")).toBe(false);
    expect(isLgsParentView(null)).toBe(false);
    expect(isLgsParentView(undefined)).toBe(false);
    expect(isLgsParentView("")).toBe(false);
  });

  it("is also true for a 7th grader (exam_type YKS + is_maarif7), and only for them among the YKS-type students", () => {
    expect(isLgsParentView("YKS", true)).toBe(true);
    expect(isLgsParentView("YKS", false)).toBe(false);
    expect(isLgsParentView("YKS", null)).toBe(false);
    expect(isLgsParentView("YKS", undefined)).toBe(false);
    expect(isLgsParentView("LGS", false)).toBe(true);
  });
});
