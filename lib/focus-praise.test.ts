import { describe, expect, it } from "vitest";
import {
  GOAL_HIT_MESSAGES,
  LONG_SESSION_MESSAGES,
  SHORT_SESSION_MESSAGES,
  STANDARD_SESSION_MESSAGES,
  resolvePraiseMessage,
} from "./focus-praise";

const first = () => 0;

describe("resolvePraiseMessage", () => {
  it("a completed countdown goal always gets the goal message, even for a short one", () => {
    expect(GOAL_HIT_MESSAGES).toContain(resolvePraiseMessage(15 * 60, true, first));
  });

  it("picks the tier by duration", () => {
    expect(SHORT_SESSION_MESSAGES).toContain(resolvePraiseMessage(5 * 60, false, first));
    expect(STANDARD_SESSION_MESSAGES).toContain(resolvePraiseMessage(30 * 60, false, first));
    expect(LONG_SESSION_MESSAGES).toContain(resolvePraiseMessage(90 * 60, false, first));
  });

  it("switches tier exactly at 20 and 50 minutes", () => {
    expect(STANDARD_SESSION_MESSAGES).toContain(resolvePraiseMessage(20 * 60, false, first));
    expect(LONG_SESSION_MESSAGES).toContain(resolvePraiseMessage(50 * 60, false, first));
  });
});
