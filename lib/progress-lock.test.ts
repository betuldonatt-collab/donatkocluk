import { beforeEach, describe, expect, it, vi } from "vitest";

import { lockButtonState } from "./progress-lock-ui";

// ---------------------------------------------------------------------------------------------------------------------------------
// The button on the schedule board
// ---------------------------------------------------------------------------------------------------------------------------------
describe("lockButtonState: when the lock button reads 'Kilidi Aç'", () => {
  const today = "2026-10-20";

  it("a lock made TODAY flips the button even on the current week (this was the bug: the lock saved, the button stayed 'Kilitle')", () => {
    // current week: today and the days ahead are in view, so the window does NOT lie before the lock day
    const s = lockButtonState({ lockedThroughDate: today, today, weekEnd: "2026-10-26" });
    expect(s.weekFrozen).toBe(false);
    expect(s.lockedToday).toBe(true);
    expect(s.showUnlock).toBe(true);
  });

  it("a past week that is entirely before the lock day is frozen and offers the unlock (as before)", () => {
    const s = lockButtonState({ lockedThroughDate: today, today, weekEnd: "2026-10-12" });
    expect(s).toEqual({ weekFrozen: true, lockedToday: true, showUnlock: true });
    const older = lockButtonState({ lockedThroughDate: "2026-10-15", today, weekEnd: "2026-10-12" });
    expect(older).toEqual({ weekFrozen: true, lockedToday: false, showUnlock: true });
  });

  it("never locked, or locked on an earlier day and viewing a window that reaches the lock day: the button offers to lock", () => {
    expect(lockButtonState({ lockedThroughDate: null, today, weekEnd: "2026-10-26" }).showUnlock).toBe(false);
    expect(lockButtonState({ lockedThroughDate: "2026-10-13", today, weekEnd: "2026-10-26" }).showUnlock).toBe(false);
  });

  it("the window that ENDS on the lock day is not frozen (the lock day belongs to the open cycle)", () => {
    expect(lockButtonState({ lockedThroughDate: "2026-10-18", today, weekEnd: "2026-10-18" }).weekFrozen).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The actions
// ---------------------------------------------------------------------------------------------------------------------------------
const COACH = "coach1";
const STUDENT = "22222222-2222-4222-8222-222222222222";
const TODAY = new Date().toISOString().slice(0, 10);
const DAYS_AGO = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Row = Record<string, unknown>;
const db: {
  roster: string[];
  locks: Row[];
  firstSession: Row | null;
  resolved: Row[]; // what the finalize UPDATE returns
  insertError: unknown;
  resolveError: unknown;
  undoError: unknown;
  deleteMatches: boolean;
  rpcFailures: Map<string, number>; // key -> how many times it still fails
  rpcCalls: string[];
  deletes: string[];
  inFlight: number;
  maxInFlight: number;
} = {
  roster: [],
  locks: [],
  firstSession: null,
  resolved: [],
  insertError: null,
  resolveError: null,
  undoError: null,
  deleteMatches: true,
  rpcFailures: new Map(),
  rpcCalls: [],
  deletes: [],
  inFlight: 0,
  maxInFlight: 0,
};

function builder(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  const filters: [string, unknown][] = [];
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.insert = () => ((op = "insert"), b);
  b.update = () => ((op = "update"), b);
  b.delete = () => ((op = "delete"), b);
  for (const m of ["eq", "gte", "lte", "order", "limit"]) b[m] = (col: string, val: unknown) => (filters.push([`${m}:${col}`, val]), b);
  const result = () => {
    if (table === "coach_students") return { data: db.roster.includes(String(filters.find(([k]) => k === "eq:student_id")?.[1])) ? { student_id: STUDENT } : null, error: null };
    if (table === "coaching_sessions") return { data: db.firstSession, error: null };
    if (table === "progress_locks") {
      if (op === "insert") {
        if (db.insertError) return { data: null, error: db.insertError };
        const row = { id: `lock-${db.locks.length + 1}`, locked_at: new Date().toISOString() };
        db.locks.unshift(row);
        return { data: row, error: null };
      }
      if (op === "delete") {
        const id = String(filters.find(([k]) => k === "eq:id")?.[1]);
        if (db.undoError) return { data: null, error: db.undoError };
        if (!db.deleteMatches) return { data: [], error: null };
        db.deletes.push(id);
        db.locks = db.locks.filter((l) => l.id !== id);
        return { data: [{ id }], error: null };
      }
      return { data: db.locks[0] ?? null, error: null };
    }
    if (table === "student_tasks" && op === "update") return db.resolveError ? { data: null, error: db.resolveError } : { data: db.resolved, error: null };
    return { data: null, error: null };
  };
  b.single = async () => result();
  b.maybeSingle = async () => result();
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: COACH } } }) },
    from: (t: string) => builder(t),
    rpc: async (_fn: string, args: { p_course_id: string; p_topic_id: string }) => {
      const key = `${args.p_course_id}::${args.p_topic_id}`;
      db.rpcCalls.push(key);
      db.inFlight += 1;
      db.maxInFlight = Math.max(db.maxInFlight, db.inFlight);
      await Promise.resolve();
      db.inFlight -= 1;
      const left = db.rpcFailures.get(key) ?? 0;
      if (left > 0) {
        db.rpcFailures.set(key, left - 1);
        return { error: { code: "57014", message: "canceling statement due to statement timeout" } };
      }
      return { error: null };
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { lockCurrentCycle, unlockLatestCycle } from "@/app/coach/actions";

beforeEach(() => {
  db.roster = [STUDENT];
  db.locks = [];
  db.firstSession = { scheduled_at: `${DAYS_AGO(20)}T10:00:00Z` };
  db.resolved = [];
  db.insertError = null;
  db.resolveError = null;
  db.undoError = null;
  db.deleteMatches = true;
  db.rpcFailures = new Map();
  db.rpcCalls = [];
  db.deletes = [];
  db.inFlight = 0;
  db.maxInFlight = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lockCurrentCycle", () => {
  it("locks and answers with the new state (today), so the board needs no second read", async () => {
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: true, lockedThroughDate: TODAY });
    expect(db.locks).toHaveLength(1);
  });

  it("every refusal comes back as a message the coach can read, never a throw", async () => {
    db.locks = [{ id: "l0", locked_at: `${TODAY}T07:00:00Z` }];
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: false, error: "Program bugün zaten kilitlendi." });

    db.locks = [];
    db.firstSession = null;
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: false, error: "İlk görüşme tamamlanmadan program kilitlenemez." });

    db.roster = [];
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });

    expect(await lockCurrentCycle("not-a-uuid")).toMatchObject({ ok: false });
    expect(db.locks).toEqual([]);
  });

  it("a failed lock write is reported (generic, with the cause logged), and nothing is left behind", async () => {
    db.insertError = { code: "42501", message: "permission denied for table progress_locks" };
    const r = await lockCurrentCycle(STUDENT);
    expect(r.ok).toBe(false);
    expect(db.locks).toEqual([]);
  });

  it("when finalizing the pending tasks fails, the lock is undone: no frozen cycle with tasks left in limbo", async () => {
    db.resolveError = { code: "57014", message: "canceling statement due to statement timeout" };
    const r = await lockCurrentCycle(STUDENT);
    expect(r.ok).toBe(false);
    expect(db.deletes).toHaveLength(1);
    expect(db.locks).toEqual([]);
  });

  it("if even the undo fails, the coach is told exactly what to do", async () => {
    db.resolveError = { code: "57014", message: "timeout" };
    db.undoError = { code: "XX000", message: "boom" };
    const r = await lockCurrentCycle(STUDENT);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("Kilidi Aç");
  });

  it("the topic resyncs run in parallel batches, not one after another", async () => {
    db.resolved = Array.from({ length: 20 }, (_, i) => ({ course_id: "tyt-matematik", topic_id: `t${i}` }));
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: true, lockedThroughDate: TODAY });
    expect(db.rpcCalls).toHaveLength(20);
    expect(db.maxInFlight).toBeGreaterThan(1);
    expect(db.maxInFlight).toBeLessThanOrEqual(6);
  });

  it("a resync that fails once is retried; one that keeps failing does NOT undo the lock, it is reported as a warning", async () => {
    db.resolved = [
      { course_id: "tyt-matematik", topic_id: "a" },
      { course_id: "tyt-matematik", topic_id: "b" },
    ];
    db.rpcFailures.set("tyt-matematik::a", 1); // recovers on the retry
    db.rpcFailures.set("tyt-matematik::b", 5); // never recovers
    const r = await lockCurrentCycle(STUDENT);
    expect(r).toMatchObject({ ok: true, lockedThroughDate: TODAY });
    expect((r as { warning?: string }).warning).toContain("1 konunun");
    expect(db.locks).toHaveLength(1); // the lock stands
    expect(db.rpcCalls.filter((k) => k === "tyt-matematik::a")).toHaveLength(2);
  });

  it("a task with no course does not trigger a resync", async () => {
    db.resolved = [{ course_id: null, topic_id: null }];
    expect(await lockCurrentCycle(STUDENT)).toEqual({ ok: true, lockedThroughDate: TODAY });
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("unlockLatestCycle", () => {
  it("removes the latest lock and answers with what is locked now", async () => {
    db.locks = [
      { id: "l2", locked_at: `${TODAY}T08:00:00Z` },
      { id: "l1", locked_at: `${DAYS_AGO(14)}T08:00:00Z` },
    ];
    expect(await unlockLatestCycle(STUDENT)).toEqual({ ok: true, lockedThroughDate: DAYS_AGO(14) });
    expect(db.deletes).toEqual(["l2"]);
  });

  it("with no lock at all it is simply 'not locked'", async () => {
    expect(await unlockLatestCycle(STUDENT)).toEqual({ ok: true, lockedThroughDate: null });
  });

  it("a delete the database silently filtered out is an error, not a success", async () => {
    db.locks = [{ id: "l1", locked_at: `${TODAY}T08:00:00Z` }];
    db.deleteMatches = false;
    const r = await unlockLatestCycle(STUDENT);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("kaldırılamadı");
  });

  it("a student off the roster, or a database error, comes back as a message", async () => {
    db.roster = [];
    expect(await unlockLatestCycle(STUDENT)).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });
    db.roster = [STUDENT];
    db.locks = [{ id: "l1", locked_at: `${TODAY}T08:00:00Z` }];
    db.undoError = { code: "42501", message: "denied" };
    expect((await unlockLatestCycle(STUDENT)).ok).toBe(false);
  });
});

describe("the board's handler never fails silently", () => {
  it("reads the result (toast on failure), derives the button from lockButtonState, and catches a thrown call", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/coach/students/[id]/schedule/schedule-board.tsx", "utf8");
    expect(src).toContain("lockButtonState(");
    expect(src).toMatch(/if \(!result\.ok\) \{\s*[^}]*toast\.error\(result\.error\)/);
    expect(src).toMatch(/catch \(e\) \{\s*toast\.error\(friendlyError\(e, next/);
    // the old rule (a window entirely before the lock day) is no longer what decides the button
    expect(src).not.toMatch(/const weekLocked = lockedThroughDate !== null/);
    expect(src).toContain("showUnlock ?");
  });
});
