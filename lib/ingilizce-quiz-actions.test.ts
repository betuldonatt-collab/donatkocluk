import { beforeEach, describe, expect, it, vi } from "vitest";

// submitVocabAnswer runs against a mocked Supabase client, same convention as
// lib/focus-actions.test.ts -- this pins down the TypeScript side (the
// nextStreak/isMastered math and what gets upserted), not the DB itself.

const WORD = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
const state: {
  existingProgress: Row | null;
  upsertError: unknown;
  taskRow: Row | null;
  taskUpdateError: unknown;
  upsertPayloads: Row[];
} = {
  existingProgress: null,
  upsertError: null,
  taskRow: null,
  taskUpdateError: null,
  upsertPayloads: [],
};

function builder(table: string) {
  let op: "select" | "update" = "select";
  const result = () => {
    if (table === "student_word_progress") return { data: state.existingProgress, error: null };
    if (table === "student_tasks") {
      if (op === "update") return { error: state.taskUpdateError };
      return { data: state.taskRow, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  b.select = () => {
    op = "select";
    return b;
  };
  b.update = () => {
    op = "update";
    return b;
  };
  b.eq = () => b;
  b.upsert = (payload: Row) => {
    state.upsertPayloads.push(payload);
    return Promise.resolve({ error: state.upsertError });
  };
  b.maybeSingle = () => Promise.resolve(result());
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: (table: string) => builder(table),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

beforeEach(() => {
  state.existingProgress = null;
  state.upsertError = null;
  state.taskRow = null;
  state.taskUpdateError = null;
  state.upsertPayloads = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitVocabAnswer", () => {
  it("starts a fresh streak at 1 on a correct answer with no prior progress", async () => {
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, true);
    expect(result).toMatchObject({ ok: true, nextStreak: 1, isMastered: false });
  });

  it("extends an existing streak by one on a correct answer", async () => {
    state.existingProgress = { correct_streak: 1 };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, true);
    expect(result).toMatchObject({ ok: true, nextStreak: 2, isMastered: false });
  });

  it("flips isMastered exactly when the streak reaches WORD_MASTERY_STREAK (3)", async () => {
    state.existingProgress = { correct_streak: 2 };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, true);
    expect(result).toMatchObject({ ok: true, nextStreak: 3, isMastered: true });
  });

  it("resets the streak to 0 on an incorrect answer (including a Pas Geç skip), never mastered", async () => {
    state.existingProgress = { correct_streak: 2 };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, false);
    expect(result).toMatchObject({ ok: true, nextStreak: 0, isMastered: false });
  });

  it("upserts the same nextStreak it returns, so the dots and the saved row never disagree", async () => {
    state.existingProgress = { correct_streak: 1 };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    await submitVocabAnswer(WORD, true);
    expect(state.upsertPayloads[0]).toMatchObject({ word_id: WORD, correct_streak: 2, is_mastered: false });
  });

  it("returns a diagnosable error instead of throwing when the save fails", async () => {
    state.upsertError = { code: "42501", message: "permission denied" };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, true);
    expect(result.ok).toBe(false);
  });

  it("returns a diagnosable error when an assigned task's own update fails, even though the word's streak already saved", async () => {
    state.taskRow = { student_id: "u1", total_count: 10, correct_count: 0, status: "pending" };
    state.taskUpdateError = { code: "42501", message: "permission denied" };
    const { submitVocabAnswer } = await import("../app/student/ingilizce-quiz/actions");
    const result = await submitVocabAnswer(WORD, true, TASK);
    expect(result.ok).toBe(false);
  });
});
