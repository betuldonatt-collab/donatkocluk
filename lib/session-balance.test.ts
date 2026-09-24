import { describe, expect, it } from "vitest";

import { sessionBalance } from "./session-balance";

describe("sessionBalance", () => {
  it("is paid minus completed", () => {
    const rows = [
      { is_paid: true, outcome: "completed" },
      { is_paid: true, outcome: "pending" },
      { is_paid: true, outcome: "pending" },
    ];
    expect(sessionBalance(rows)).toMatchObject({ paid: 3, completed: 1, remaining: 2, unpaidCompleted: 0 });
  });

  it("goes negative when a completed session is unpaid", () => {
    const rows = [{ is_paid: false, outcome: "completed" }];
    expect(sessionBalance(rows)).toMatchObject({ remaining: -1, unpaidCompleted: 1 });
  });

  it("ignores not_happened sessions", () => {
    expect(sessionBalance([{ is_paid: true, outcome: "not_happened" }]).remaining).toBe(1);
  });
});
