import { describe, expect, it } from "vitest";
import { decideOpenAction } from "./focus-open-decision";

describe("decideOpenAction", () => {
  it("banks a paused session (its time is final)", () => {
    expect(decideOpenAction({ status: "paused" })).toBe("bank");
  });

  it("always attaches to a running session -- never closes one because its page went quiet", () => {
    expect(decideOpenAction({ status: "running" })).toBe("attach");
  });
});
