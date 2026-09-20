import { beforeEach, describe, expect, it, vi } from "vitest";

// The Süre Tut server actions run against a mocked Supabase client: this pins
// down the parts that live in TypeScript (argument handling, the > 6 h
// prediction, error reporting). The SQL itself (end_focus_session /
// review_focus_session) is covered by the migration's own verification query.

type Row = Record<string, unknown>;
const state: {
  session: Row | null;
  reviews: Row[];
  rpcResult: { data: unknown; error: unknown };
  runningRows: Row[] | null;
  runningError: unknown;
  rpcCalls: { fn: string; args: unknown }[];
} = { session: null, reviews: [], rpcResult: { data: 90, error: null }, runningRows: [], runningError: null, rpcCalls: [] };

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const result = () => {
    if (table === "focus_sessions") {
      if (filters.status === "running") return { data: state.runningRows, error: state.runningError };
      return { data: state.session, error: null };
    }
    if (table === "focus_session_reviews") return { data: state.reviews, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lt", "order", "limit", "update", "upsert", "in"]) b[m] = () => b;
  b.eq = (column: string, value: unknown) => {
    filters[column] = value;
    return b;
  };
  b.maybeSingle = () => Promise.resolve(result());
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args });
    return state.rpcResult;
  },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

const TASK = "11111111-1111-4111-8111-111111111111";

function runningSince(seconds: number): Row {
  return {
    id: "s1",
    mode: "stopwatch",
    countdown_target_seconds: null,
    status: "running",
    run_started_at: new Date(Date.now() - seconds * 1000).toISOString(),
    accumulated_seconds: 0,
    last_heartbeat_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  state.session = runningSince(90);
  state.reviews = [];
  state.rpcResult = { data: 90, error: null };
  state.runningRows = [];
  state.runningError = null;
  state.rpcCalls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("endFocusSession", () => {
  it("ends a normal session and reports it as saved", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    const result = await endFocusSession(TASK);
    expect(result).toEqual({ ok: true, totalSeconds: 90, pendingApproval: false });
    expect(state.rpcCalls[0].fn).toBe("end_focus_session");
  });

  it("accepts null for the optional credited seconds (an omitted argument can arrive as null)", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    expect((await endFocusSession(TASK, null)).ok).toBe(true);
    expect((await endFocusSession(TASK, undefined)).ok).toBe(true);
  });

  it("says 'pending approval' only when the database really parked a > 6 h session", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    state.session = runningSince(7 * 3600);

    state.reviews = []; // e.g. migration 0086 not applied -> nothing was parked
    expect(await endFocusSession(TASK)).toMatchObject({ ok: true, pendingApproval: false });

    state.reviews = [{ id: "r1" }];
    expect(await endFocusSession(TASK)).toMatchObject({ ok: true, pendingApproval: true });
  });

  it("does not flag a session at or under 6 hours", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    state.session = runningSince(5 * 3600);
    state.reviews = [{ id: "r1" }];
    expect(await endFocusSession(TASK)).toMatchObject({ ok: true, pendingApproval: false });
  });

  it("returns a diagnosable error (with the Postgres code) instead of throwing", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    state.rpcResult = { data: null, error: { code: "42501", message: "permission denied" } };
    const result = await endFocusSession(TASK);
    expect(result).toEqual({ ok: false, error: "Odak süresi kaydedilemedi (hata kodu: 42501)." });
  });

  it("returns a friendly error for an invalid task id", async () => {
    const { endFocusSession } = await import("../app/student/actions");
    const result = await endFocusSession("not-a-uuid");
    expect(result.ok).toBe(false);
  });
});

describe("getRunningFocusSessions", () => {
  it("returns running sessions with the embedded task title", async () => {
    const { getRunningFocusSessions } = await import("../app/student/actions");
    state.runningRows = [{ ...runningSince(120), task_id: TASK, student_tasks: { title: "TYT Türkçe" } }];
    const rows = await getRunningFocusSessions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskId: TASK, taskTitle: "TYT Türkçe", mode: "stopwatch" });
    expect(rows[0].elapsedSeconds).toBeGreaterThanOrEqual(120);
  });

  it("returns [] on a read error but logs it, so an empty widget is diagnosable", async () => {
    const { getRunningFocusSessions } = await import("../app/student/actions");
    state.runningRows = null;
    state.runningError = { code: "PGRST200", message: "relationship not found" };
    expect(await getRunningFocusSessions()).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});
