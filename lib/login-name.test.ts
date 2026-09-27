import { describe, expect, it } from "vitest";

import { formatLoginName } from "./phone";

describe("formatLoginName", () => {
  it("shows a Turkish mobile login as 05XX XXX XX XX, from any stored form", () => {
    expect(formatLoginName("905321234567")).toBe("0532 123 45 67");
    expect(formatLoginName("+905321234567")).toBe("0532 123 45 67");
    expect(formatLoginName("05321234567")).toBe("0532 123 45 67");
  });

  it("shows anything else as stored, and nothing when empty", () => {
    expect(formatLoginName("12345")).toBe("12345");
    expect(formatLoginName("")).toBeNull();
    expect(formatLoginName(null)).toBeNull();
    expect(formatLoginName(undefined)).toBeNull();
  });
});
