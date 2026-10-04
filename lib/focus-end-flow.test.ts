import { describe, expect, it, vi } from "vitest";

// focus-end-flow pulls in toast/stores and the Server Action module; only its
// pure retry logic is under test here.
vi.mock("sonner", () => ({ toast: {} }));
vi.mock("@/app/student/actions", () => ({ endFocusSession: vi.fn() }));

import { endWithRetry } from "./focus-end-flow";
import type { EndFocusSessionResult } from "@/app/student/actions";

const ok = (over: Partial<Extract<EndFocusSessionResult, { ok: true }>> = {}): EndFocusSessionResult => ({
  ok: true,
  totalSeconds: 100,
  pendingApproval: false,
  bankedSeconds: 100,
  hadSession: true,
  ...over,
});

describe("endWithRetry", () => {
  it("returns the first success without retrying", async () => {
    const attempt = vi.fn().mockResolvedValue(ok());
    const result = await endWithRetry("t", undefined, attempt, 50, [1, 1]);
    expect(result.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a failure twice, then succeeds", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "x" })
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(ok());
    const result = await endWithRetry("t", undefined, attempt, 50, [1, 1]);
    expect(result.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up after 3 attempts with a readable reason", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const result = await endWithRetry("t", undefined, attempt, 50, [1, 1]);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("internet bağlantın");
  });

  it("treats a hung request as a failure after the timeout and retries it", async () => {
    const attempt = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(ok());
    const result = await endWithRetry("t", undefined, attempt, 20, [1, 1]);
    expect(result.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("flags a retry that finds nothing left to end after a timeout as uncertain (the first attempt probably landed)", async () => {
    const attempt = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(ok({ hadSession: false, bankedSeconds: 0 }));
    const result = await endWithRetry("t", undefined, attempt, 20, [1, 1]);
    expect(result).toMatchObject({ ok: true, hadSession: false, uncertain: true });
  });

  it("passes the check-in's shortened figure through to every attempt", async () => {
    const attempt = vi.fn().mockResolvedValue(ok());
    await endWithRetry("t", 1800, attempt, 50, [1]);
    expect(attempt).toHaveBeenCalledWith("t", 1800);
  });
});
