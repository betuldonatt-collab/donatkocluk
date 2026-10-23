import { beforeEach, describe, expect, it, vi } from "vitest";

// The assigned-task side of the quiz actions against a small fake database: which task the answers go to, what the answers and the end of
// a run do to its status, and the student's manual "Yapılmadı".

const STUDENT = "u1";
const WORD = "11111111-1111-4111-8111-111111111111";
const T_TODAY = "22222222-2222-4222-8222-222222222222";
const T_SUNDAY = "33333333-3333-4333-8333-333333333333";
const EXTRA_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;
const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

const state: {
  tasks: Row[];
  words: Row[];
  progress: Row[];
  updates: { id: string; patch: Row }[];
  updateError: unknown;
  // false = the update matched no row (what RLS does for a locked week: no error, just nothing updated)
  updateMatches: boolean;
  // week locks (latest first) and the rows the quiz inserted
  locks: Row[];
  inserts: Row[];
  insertError: unknown;
} = { tasks: [], words: [], progress: [], updates: [], updateError: null, updateMatches: true, locks: [], inserts: [], insertError: null };

function builder(table: string) {
  const filters: [string, string, unknown][] = [];
  let op: "select" | "update" | "insert" = "select";
  let patch: Row = {};
  const rows = (): Row[] => {
    if (table === "student_tasks") {
      return state.tasks.filter((t) =>
        filters.every(([kind, col, val]) =>
          kind === "eq" ? t[col] === val : kind === "neq" ? t[col] !== val : kind === "is" ? (t[col] ?? null) === val : true,
        ),
      );
    }
    if (table === "progress_locks") return state.locks;
    if (table === "lgs_words") return state.words.filter((w) => filters.every(([k, c, v]) => (k === "eq" ? w[c] === v : true)));
    if (table === "student_word_progress") return state.progress.filter((p) => filters.every(([k, c, v]) => (k === "eq" ? p[c] === v : true)));
    return [];
  };
  const finish = () => {
    if (op === "insert" && table === "student_tasks") {
      if (state.insertError) return { data: null, error: state.insertError };
      const row = { id: EXTRA_ID, correct_count: null, ...patch };
      state.inserts.push(patch);
      state.tasks.push(row);
      return { data: row, error: null };
    }
    if (op === "update" && table === "student_tasks") {
      if (state.updateError) return { data: null, error: state.updateError };
      if (!state.updateMatches) return { data: [], error: null };
      const id = filters.find(([, c]) => c === "id")?.[2] as string;
      state.updates.push({ id, patch });
      const row = state.tasks.find((t) => t.id === id);
      if (row) Object.assign(row, patch);
      return { data: [{ id }], error: null };
    }
    return { data: rows(), error: null };
  };
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.update = (p: Row) => ((op = "update"), (patch = p), b);
  b.insert = (p: Row) => ((op = "insert"), (patch = p), b);
  b.single = async () => finish();
  b.upsert = () => Promise.resolve({ error: null });
  for (const k of ["eq", "neq", "is"]) b[k] = (col: string, val: unknown) => (filters.push([k, col, val]), b);
  for (const k of ["in", "not", "order", "limit"]) b[k] = () => b;
  b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve(finish());
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: STUDENT } } }) }, from: (t: string) => builder(t) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { completeVocabQuizRun, getActiveVocabQuizTask, markVocabQuizNotDone, submitVocabAnswer } from "@/app/student/ingilizce-quiz/actions";

const task = (id: string, over: Row = {}): Row => ({
  id,
  student_id: STUDENT,
  task_type: "vocab_quiz",
  topic_id: "1",
  status: "pending",
  total_count: 30,
  correct_count: 0,
  task_date: TODAY,
  ...over,
});

beforeEach(() => {
  state.tasks = [task(T_TODAY)];
  state.words = [
    { id: "w1", unit_number: 1 },
    { id: "w2", unit_number: 1 },
  ];
  state.progress = [];
  state.updates = [];
  state.updateError = null;
  state.updateMatches = true;
  state.locks = [];
  state.inserts = [];
  state.insertError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getActiveVocabQuizTask", () => {
  it("opened from a task card: exactly that task", async () => {
    state.tasks = [task(T_TODAY), task(T_SUNDAY, { task_date: FUTURE })];
    expect(await getActiveVocabQuizTask(1, T_SUNDAY)).toEqual({ ok: true, task: { id: T_SUNDAY, target: 30, current: 0 } });
  });
  it("opened without a task: today's task, not the latest date", async () => {
    state.tasks = [task(T_SUNDAY, { task_date: FUTURE }), task(T_TODAY)];
    const r = await getActiveVocabQuizTask(1);
    expect(r).toMatchObject({ ok: true, task: { id: T_TODAY } });
  });
  it("a task that is already done (or another unit's, or someone else's) is not offered", async () => {
    state.tasks = [task(T_TODAY, { status: "done" })];
    expect(await getActiveVocabQuizTask(1, T_TODAY)).toEqual({ ok: true, task: null });
    state.tasks = [task(T_TODAY, { topic_id: "2" })];
    expect(await getActiveVocabQuizTask(1, T_TODAY)).toEqual({ ok: true, task: null });
    state.tasks = [task(T_TODAY, { student_id: "someone-else" })];
    expect(await getActiveVocabQuizTask(1, T_TODAY)).toEqual({ ok: true, task: null });
  });
  it("a task assigned without a word count is still the active one (target null)", async () => {
    state.tasks = [task(T_TODAY, { total_count: null })];
    expect(await getActiveVocabQuizTask(1)).toEqual({ ok: true, task: { id: T_TODAY, target: null, current: 0 } });
  });
});

describe("submitVocabAnswer: the quiz sets the task's status", () => {
  it("the first answer, even a wrong one, makes the task Yarım Yapıldı", async () => {
    const r = await submitVocabAnswer(WORD, false, T_TODAY);
    expect(r.ok).toBe(true);
    expect(state.updates).toEqual([{ id: T_TODAY, patch: expect.objectContaining({ status: "half_done", correct_count: 0, completed: false }) }]);
  });
  it("a correct answer counts and reaching the target completes it", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 29 })];
    const r = await submitVocabAnswer(WORD, true, T_TODAY);
    expect(r).toMatchObject({ ok: true, taskCompleted: true });
    expect(state.updates[0].patch).toMatchObject({ status: "done", correct_count: 30, completed: true });
  });
  it("a miss on a task that is already Yarım Yapıldı writes nothing to the task", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 5 })];
    await submitVocabAnswer(WORD, false, T_TODAY);
    expect(state.updates).toEqual([]);
  });
  it("answers never touch another student's task", async () => {
    state.tasks = [task(T_TODAY, { student_id: "someone-else" })];
    await submitVocabAnswer(WORD, true, T_TODAY);
    expect(state.updates).toEqual([]);
  });
  it("a finished task is left alone", async () => {
    state.tasks = [task(T_TODAY, { status: "done", correct_count: 30 })];
    const r = await submitVocabAnswer(WORD, true, T_TODAY);
    expect(r).toMatchObject({ ok: true, taskCompleted: false });
    expect(state.updates).toEqual([]);
  });
  it("a failing status write is reported with its real code -- and the word's own result still comes back", async () => {
    state.updateError = { code: "P0001", message: "An LGS task can only be completed with the coach's approval" };
    const r = await submitVocabAnswer(WORD, true, T_TODAY);
    expect(r).toMatchObject({ ok: true, taskCompleted: false, nextCount: 1 });
    if (r.ok) expect(r.taskError).toContain("P0001");
  });
  it("an update the database silently filtered out (a locked week) is NOT reported as completed", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 29 })];
    state.updateMatches = false;
    const r = await submitVocabAnswer(WORD, true, T_TODAY);
    expect(r).toMatchObject({ ok: true, taskCompleted: false });
    if (r.ok) expect(r.taskError).toContain("kilitli");
  });
  it("a normal answer carries no task error", async () => {
    const r = await submitVocabAnswer(WORD, true, T_TODAY);
    if (r.ok) expect(r.taskError).toBeNull();
  });
});

describe("completeVocabQuizRun: the end of a run", () => {
  it("completes a task whose target was reached", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 30 })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "done" });
    expect(state.updates[0].patch).toMatchObject({ status: "done", completed: true });
  });
  it("completes a task with no target", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", total_count: null, correct_count: 7 })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "done" });
  });
  it("completes a task when every word of the unit is already learned (the target is out of reach)", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 12 })];
    state.progress = [
      { student_id: STUDENT, word_id: "w1", is_mastered: true },
      { student_id: STUDENT, word_id: "w2", is_mastered: true },
    ];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "done" });
  });
  it("leaves it Yarım Yapıldı when the target is not reached and words remain", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 12 })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "unchanged" });
    expect(state.updates).toEqual([]);
  });
  it("a unit without any words does not complete the task", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 12 })];
    state.words = [];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "unchanged" });
    expect(state.updates).toEqual([]);
  });
  it("an update the database silently filtered out is an error, not a 'done'", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 30 })];
    state.updateMatches = false;
    const r = await completeVocabQuizRun(T_TODAY, 1);
    expect(r.ok).toBe(false);
  });
  it("never touches a task that is not the student's, not a vocab quiz, or already done", async () => {
    state.tasks = [task(T_TODAY, { student_id: "someone-else", correct_count: 30 })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "unchanged" });
    state.tasks = [task(T_TODAY, { task_type: "question_bank", correct_count: 30 })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "unchanged" });
    state.tasks = [task(T_TODAY, { status: "done" })];
    expect(await completeVocabQuizRun(T_TODAY, 1)).toEqual({ ok: true, status: "unchanged" });
    expect(state.updates).toEqual([]);
  });
});

describe("markVocabQuizNotDone: the student's one manual choice", () => {
  it("marks a task Yapılmadı without any quiz having been started", async () => {
    expect(await markVocabQuizNotDone(T_TODAY)).toEqual({ ok: true });
    expect(state.updates).toEqual([{ id: T_TODAY, patch: expect.objectContaining({ status: "not_done", completed: false }) }]);
  });
  it("keeps the progress already made", async () => {
    state.tasks = [task(T_TODAY, { status: "half_done", correct_count: 9 })];
    await markVocabQuizNotDone(T_TODAY);
    expect(state.updates[0].patch).not.toHaveProperty("correct_count");
  });
  it("already Yapılmadı: nothing to write", async () => {
    state.tasks = [task(T_TODAY, { status: "not_done" })];
    expect(await markVocabQuizNotDone(T_TODAY)).toEqual({ ok: true });
    expect(state.updates).toEqual([]);
  });
  it("a finished task is not taken back", async () => {
    state.tasks = [task(T_TODAY, { status: "done" })];
    expect(await markVocabQuizNotDone(T_TODAY)).toMatchObject({ ok: false });
    expect(state.updates).toEqual([]);
  });
  it("a week the coach locked (the update matches nothing) is an error, never a silent success", async () => {
    state.updateMatches = false;
    const r = await markVocabQuizNotDone(T_TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("kilitli");
  });
  it("refuses another student's task and a task of another type", async () => {
    state.tasks = [task(T_TODAY, { student_id: "someone-else" })];
    expect(await markVocabQuizNotDone(T_TODAY)).toMatchObject({ ok: false });
    state.tasks = [task(T_TODAY, { task_type: "question_bank" })];
    expect(await markVocabQuizNotDone(T_TODAY)).toMatchObject({ ok: false });
    expect(state.updates).toEqual([]);
  });
  it("a failing write is an error result with the real code, never a throw", async () => {
    state.updateError = { code: "42501", message: "permission denied" };
    const r = await markVocabQuizNotDone(T_TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("42501");
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------
describe("a quiz started from the sidebar: bound by priority", () => {
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const extra = (over: Row = {}): Row => ({ ...task(EXTRA_ID, { total_count: null, is_coach_assigned: false, title: "Ek Çalışma", task_date: TODAY }), ...over });

  it("1) today's open task of the unit", async () => {
    state.tasks = [task("past", { task_date: YESTERDAY }), task(T_TODAY, { task_date: TODAY })];
    expect(await getActiveVocabQuizTask(1)).toMatchObject({ ok: true, task: { id: T_TODAY } });
  });
  it("2) no task today: the most recent unlocked open one from the past", async () => {
    state.tasks = [task("old", { task_date: LAST_MONTH }), task("recent", { task_date: YESTERDAY })];
    expect(await getActiveVocabQuizTask(1)).toMatchObject({ ok: true, task: { id: "recent" } });
  });
  it("2) a past task before the latest week lock is skipped (frozen)", async () => {
    state.tasks = [task("recent", { task_date: YESTERDAY })];
    state.locks = [{ locked_at: `${TODAY}T08:00:00Z` }];
    expect(await getActiveVocabQuizTask(1)).toEqual({ ok: true, task: null });
    state.locks = [{ locked_at: `${YESTERDAY}T08:00:00Z` }]; // the lock day itself is still open
    expect(await getActiveVocabQuizTask(1)).toMatchObject({ ok: true, task: { id: "recent" } });
  });
  it("3) every assigned task done (or none): nothing to bind, and merely opening the quiz creates nothing", async () => {
    state.tasks = [task(T_TODAY, { status: "done" })];
    expect(await getActiveVocabQuizTask(1)).toEqual({ ok: true, task: null });
    expect(state.inserts).toEqual([]);
  });
  it("an upcoming task is not due yet: not bound", async () => {
    state.tasks = [task(T_SUNDAY, { task_date: FUTURE })];
    expect(await getActiveVocabQuizTask(1)).toEqual({ ok: true, task: null });
  });

  it("3) the first answer with nothing to bind to creates today's 'Ek Çalışma' for the unit, and counts into it", async () => {
    state.tasks = [];
    const r = await submitVocabAnswer(WORD, true, null, 3);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      student_id: STUDENT,
      task_date: TODAY,
      task_type: "vocab_quiz",
      title: "Ek Çalışma",
      course_id: "ingilizce-quiz",
      topic_id: "3",
      total_count: null,
      is_coach_assigned: false,
      status: "pending",
    });
    // the student's own task: never self-approved (migration 0063)
    expect(state.inserts[0]).not.toHaveProperty("is_approved_by_coach");
    expect(r).toMatchObject({ ok: true, taskCompleted: false });
    if (r.ok) {
      expect(r.boundTask).toEqual({ id: EXTRA_ID, target: null, current: 1 });
      expect(r.taskError).toBeNull();
    }
    expect(state.updates[0].patch).toMatchObject({ status: "half_done", correct_count: 1 });
  });

  it("a wrong first answer still records the practice (Yarım Yapıldı, 0 words)", async () => {
    state.tasks = [];
    const r = await submitVocabAnswer(WORD, false, null, 1);
    expect(r.ok && r.boundTask).toEqual({ id: EXTRA_ID, target: null, current: 0 });
    expect(state.updates[0].patch).toMatchObject({ status: "half_done", correct_count: 0 });
  });

  it("later answers of the same quiz use the bound task: no second Ek Çalışma", async () => {
    state.tasks = [];
    await submitVocabAnswer(WORD, true, null, 1);
    const r = await submitVocabAnswer(WORD, true, EXTRA_ID, null);
    expect(state.inserts).toHaveLength(1);
    expect(r.ok && r.boundTask).toBeFalsy();
    expect(state.updates.at(-1)?.patch).toMatchObject({ correct_count: 2 });
  });

  it("another run the same day finds today's Ek Çalışma again (open or finished) instead of creating more", async () => {
    state.tasks = [extra({ status: "half_done", correct_count: 4 })];
    await submitVocabAnswer(WORD, true, null, 1);
    expect(state.inserts).toEqual([]);
    expect(state.updates[0].patch).toMatchObject({ correct_count: 5 });
  });

  it("a finished Ek Çalışma is re-opened by practising again: every run of extra effort is recorded", async () => {
    state.tasks = [extra({ status: "done", correct_count: 8 })];
    const r = await submitVocabAnswer(WORD, true, null, 1);
    expect(state.inserts).toEqual([]);
    expect(state.updates[0].patch).toMatchObject({ status: "half_done", correct_count: 9, completed: false });
    expect(r.ok && r.boundTask?.current).toBe(9);
  });

  it("the end of the run finishes the Ek Çalışma (it has no target: the run is the task)", async () => {
    state.tasks = [extra({ status: "half_done", correct_count: 6 })];
    expect(await completeVocabQuizRun(EXTRA_ID, 1)).toEqual({ ok: true, status: "done" });
  });

  it("an Ek Çalışma of another unit or another day is not reused", async () => {
    state.tasks = [extra({ topic_id: "2", status: "half_done" }), extra({ id: "yday", task_date: YESTERDAY, status: "half_done" })];
    await submitVocabAnswer(WORD, true, null, 1);
    expect(state.inserts).toHaveLength(1);
  });

  it("a coach-assigned task without a word count is NOT re-opened once finished", async () => {
    state.tasks = [task(T_TODAY, { total_count: null, is_coach_assigned: true, status: "done", correct_count: 5 })];
    await submitVocabAnswer(WORD, true, T_TODAY);
    expect(state.updates).toEqual([]);
  });

  it("when the Ek Çalışma cannot be created (today is locked, ...) the word's result still comes back, with the reason", async () => {
    state.tasks = [];
    state.insertError = { code: "42501", message: "new row violates row-level security policy" };
    const r = await submitVocabAnswer(WORD, true, null, 1);
    expect(r).toMatchObject({ ok: true, nextCount: 1 });
    if (r.ok) {
      expect(r.taskError).toContain("42501");
      expect(r.boundTask).toBeNull();
    }
  });

  it("an explicit task still wins over the extra: answers for a bound task never create an Ek Çalışma", async () => {
    state.tasks = [task(T_TODAY)];
    await submitVocabAnswer(WORD, true, T_TODAY, 1);
    expect(state.inserts).toEqual([]);
  });
});
