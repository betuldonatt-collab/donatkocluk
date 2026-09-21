import { describe, expect, it } from "vitest";
import { ACTIVE_HEARTBEAT_WINDOW_MS, decideOpenAction } from "./focus-open-decision";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3600;

describe("decideOpenAction", () => {
  it("banks a paused session, whatever its age or length", () => {
    expect(decideOpenAction({ status: "paused", lastHeartbeatAt: ago(1000), elapsedSeconds: 600 }, NOW)).toBe("bank");
    expect(decideOpenAction({ status: "paused", lastHeartbeatAt: ago(9 * 3600_000), elapsedSeconds: 8 * HOUR }, NOW)).toBe("bank");
  });

  it("attaches to a running session that has reported in recently (it is alive elsewhere)", () => {
    expect(decideOpenAction({ status: "running", lastHeartbeatAt: ago(30_000), elapsedSeconds: 1200 }, NOW)).toBe("attach");
    expect(
      decideOpenAction({ status: "running", lastHeartbeatAt: ago(ACTIVE_HEARTBEAT_WINDOW_MS), elapsedSeconds: 1200 }, NOW),
    ).toBe("attach");
  });

  it("banks a running session whose page has gone quiet, when it is 3 hours or less", () => {
    const quiet = ago(ACTIVE_HEARTBEAT_WINDOW_MS + 1000);
    expect(decideOpenAction({ status: "running", lastHeartbeatAt: quiet, elapsedSeconds: 45 * 60 }, NOW)).toBe("bank");
    expect(decideOpenAction({ status: "running", lastHeartbeatAt: quiet, elapsedSeconds: 3 * HOUR }, NOW)).toBe("bank");
  });

  it("shows (attaches to) a quiet running session over 3 hours so the check-in can ask, instead of crediting it unseen", () => {
    const quiet = ago(2 * 3600_000);
    expect(decideOpenAction({ status: "running", lastHeartbeatAt: quiet, elapsedSeconds: 3 * HOUR + 1 }, NOW)).toBe("attach");
    expect(decideOpenAction({ status: "running", lastHeartbeatAt: quiet, elapsedSeconds: 9 * HOUR }, NOW)).toBe("attach");
  });
});
