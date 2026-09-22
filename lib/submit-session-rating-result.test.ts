import { beforeEach, describe, expect, it, vi } from "vitest";

// submitSessionRating must never THROW an uncaught rejection to the client --
// a Server Action's rejected promise that reaches the browser unhandled
// surfaces in production as the opaque "Server Components render" message
// (React error #441) instead of the actual reason, exactly like
// updateTaskProgress/saveTaskAnalysis (see lib/update-task-progress-result.test.ts).
// This locks in the "always resolves to a result" contract.

type Row = Record<string, unknown>;

const USER = "u1";
const SESSION = "22222222-2222-4222-8222-222222222222";

const state: { session: Row | null; updateError: unknown } = { session: null, updateError: null };

function baseSession(overrides: Row = {}): Row {
  return { id: SESSION, student_id: USER, ...overrides };
}

function builder() {
  let op: "select" | "update" = "select";
  let payload: Row = {};
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.update = (p: Row) => {
    op = "update";
    payload = p;
    return b;
  };
  b.maybeSingle = () => Promise.resolve({ data: state.session, error: null });
  b.single = () => {
    if (op === "update" && state.updateError) return Promise.resolve({ data: null, error: state.updateError });
    return Promise.resolve({ data: state.session ? { ...state.session, ...payload } : null, error: null });
  };
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: () => builder(),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { submitSessionRating } from "../app/student/actions";

beforeEach(() => {
  state.session = baseSession();
  state.updateError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitSessionRating never throws -- always a result", () => {
  it("a normal save resolves ok:true", async () => {
    const result = await submitSessionRating(SESSION, 5, "Çok verimliydi");
    expect(result.ok).toBe(true);
  });

  it("a rating of 0 (out of the 1-5 schema range) resolves ok:false instead of rejecting", async () => {
    const result = await submitSessionRating(SESSION, 0, null);
    expect(result.ok).toBe(false);
  });

  it("a session that is not the caller's own resolves ok:false", async () => {
    state.session = baseSession({ student_id: "someone-else" });
    const result = await submitSessionRating(SESSION, 4, null);
    expect(result).toEqual({ ok: false, error: "Bu görüşme sana ait değil." });
  });

  it("a session that doesn't exist at all resolves ok:false", async () => {
    state.session = null;
    const result = await submitSessionRating(SESSION, 4, null);
    expect(result).toEqual({ ok: false, error: "Bu görüşme sana ait değil." });
  });

  it("an unexpected database failure on the write itself resolves ok:false with a generic message", async () => {
    state.updateError = { code: "XX000", message: "connection reset" };
    const result = await submitSessionRating(SESSION, 4, null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("connection reset");
  });
});
