import { beforeEach, describe, expect, it, vi } from "vitest";

// updateTaskProgress must never THROW an uncaught rejection to the client -- a
// Server Action's rejected promise that reaches the browser unhandled surfaces
// in production as the opaque "Server Components render" message (React error
// #441) instead of the actual reason (see the fix's own comment on the
// function). This locks in the "always resolves to a result" contract for both
// a normal validation failure (missing exam scores) and a genuinely unexpected
// one (a failing database write).

type Row = Record<string, unknown>;

const USER = "u1";
const TASK = "11111111-1111-4111-8111-111111111111";

const state: { task: Row; updateError: unknown } = { task: {}, updateError: null };

function baseTask(overrides: Row = {}): Row {
  return {
    id: TASK,
    student_id: USER,
    task_date: "2026-09-22",
    course_id: null,
    topic_id: null,
    task_type: "general_exam",
    title: "TYT Genel Deneme",
    status: "pending",
    is_coach_assigned: true,
    is_approved_by_coach: true,
    evidence_image_paths: [],
    evidence_review_status: "none",
    evidence_photo_status: {},
    total_count: null,
    correct_count: null,
    wrong_count: null,
    empty_count: null,
    ...overrides,
  };
}

function builder(table: string) {
  let op: "select" | "update" | "delete" | "insert" = "select";
  let payload: Row = {};
  const row = () => (op === "update" ? { ...state.task, ...payload } : state.task);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b;
  b.update = (p: Row) => {
    op = "update";
    payload = p;
    return b;
  };
  b.delete = () => {
    op = "delete";
    return b;
  };
  b.insert = () => {
    op = "insert";
    return Promise.resolve({ error: null });
  };
  b.single = () => {
    if (table === "student_tasks" && op === "update" && state.updateError) {
      return Promise.resolve({ data: null, error: state.updateError });
    }
    return Promise.resolve({ data: row(), error: null });
  };
  b.maybeSingle = () => Promise.resolve({ data: row(), error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: op === "delete" ? null : [row()], error: op === "delete" ? state.updateError : null });
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: (table: string) => builder(table),
  rpc: () => {
    const p = Promise.resolve({ data: {}, error: null });
    return Object.assign(p, { single: () => p });
  },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { saveTaskAnalysis, updateTaskProgress } from "../app/student/actions";

beforeEach(() => {
  state.task = baseTask();
  state.updateError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updateTaskProgress never throws -- always a result", () => {
  it("a normal save resolves ok:true with the updated row", async () => {
    state.task = baseTask({ task_type: "question_bank", total_count: 10, correct_count: 5, wrong_count: 2, empty_count: 3 });
    const result = await updateTaskProgress(TASK, { correct_count: 8, wrong_count: 1, empty_count: 1 });
    expect(result.ok).toBe(true);
  });

  it("an incomplete Genel Deneme submission resolves ok:false instead of rejecting", async () => {
    const result = await updateTaskProgress(TASK, {
      subject_scores: { turkce: { correct: 15, wrong: null, empty: null } },
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("doğru, yanlış ve boş") });
  });

  it("a task that is not the caller's own resolves ok:false", async () => {
    state.task = baseTask({ student_id: "someone-else" });
    const result = await updateTaskProgress(TASK, { status: "done" });
    expect(result).toEqual({ ok: false, error: "Bu görev sana ait değil." });
  });

  it("an unexpected database failure on the write itself resolves ok:false with a generic message", async () => {
    state.task = baseTask({ task_type: "question_bank", total_count: 10 });
    state.updateError = { code: "XX000", message: "connection reset" };
    const result = await updateTaskProgress(TASK, { correct_count: 5, wrong_count: 2, empty_count: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("connection reset");
  });
});

describe("saveTaskAnalysis never throws -- always a result", () => {
  it("a normal analysis save resolves ok:true", async () => {
    const result = await saveTaskAnalysis(TASK, [{ course_id: "tyt-matematik", topic_id: "karma", status: "wrong" }], false);
    expect(result.ok).toBe(true);
  });

  it("deferring ('Analizi Sonra Yap') also resolves ok:true", async () => {
    const result = await saveTaskAnalysis(TASK, [], true);
    expect(result.ok).toBe(true);
  });

  it("a task that is not the caller's own resolves ok:false", async () => {
    state.task = baseTask({ student_id: "someone-else" });
    const result = await saveTaskAnalysis(TASK, [], false);
    expect(result).toEqual({ ok: false, error: "Bu görev sana ait değil." });
  });

  it("an unexpected database failure resolves ok:false with a generic message", async () => {
    state.updateError = { code: "XX000", message: "connection reset" };
    const result = await saveTaskAnalysis(TASK, [{ course_id: "tyt-matematik", topic_id: "karma", status: "wrong" }], false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("connection reset");
  });
});
