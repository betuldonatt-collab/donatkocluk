import { describe, expect, it } from "vitest";
import { isLiveNow, LIVE_STATUS_STALE_MS } from "./focus-live-status";

describe("isLiveNow", () => {
  const now = 1_000_000;

  it("returns false when there's no heartbeat at all", () => {
    expect(isLiveNow(null, now)).toBe(false);
  });

  it("returns true for a heartbeat well within the staleness window", () => {
    const heartbeatAt = new Date(now - 5_000).toISOString();
    expect(isLiveNow(heartbeatAt, now)).toBe(true);
  });

  it("returns false for a heartbeat older than the staleness window", () => {
    const heartbeatAt = new Date(now - (LIVE_STATUS_STALE_MS + 1_000)).toISOString();
    expect(isLiveNow(heartbeatAt, now)).toBe(false);
  });

  it("returns false exactly at the staleness boundary", () => {
    const heartbeatAt = new Date(now - LIVE_STATUS_STALE_MS).toISOString();
    expect(isLiveNow(heartbeatAt, now)).toBe(false);
  });
});
