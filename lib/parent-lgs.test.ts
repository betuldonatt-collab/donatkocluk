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
});
