import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The student's home page (app/student/page.tsx) against an in-memory Supabase that applies the filters, ordering and
// .range() paging the way PostgREST does -- including its 1000-row cap per request. It pins what the optimized loader
// must still produce: every task shown with its resource names, the all-time tracked minutes and the session balance
// summed over the WHOLE history (past the cap), the progress window, and the focus reviews.

type Row = Record<string, unknown>;
const USER = "22222222-2222-4222-8222-222222222222";
const db: Record<string, Row[]> = {};
const selectLog: { table: string; columns: string }[] = [];
const MAX_ROWS = 1000;

function pathGet(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Row)[key] : undefined), row);
}

function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const orders: { col: string; asc: boolean }[] = [];
  let count = false;
  let range: [number, number] | null = null;
  let limit: number | null = null;
  let single = false;
  const run = () => {
    let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    for (const { col, asc } of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = pathGet(a, col) as string | number;
        const y = pathGet(b, col) as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    const total = rows.length;
    const from = range ? range[0] : 0;
    const to = range ? Math.min(range[1], from + MAX_ROWS - 1) : (limit ?? MAX_ROWS) - 1;
    rows = rows.slice(from, Math.min(to, from + MAX_ROWS - 1) + 1);
    if (limit !== null && !range) rows = rows.slice(0, limit);
    const data = single ? (rows[0] ?? null) : rows;
    return { data, error: null, count: count ? total : null };
  };
  const cmp = (col: string, op: (a: string | number, b: string | number) => boolean) => (v: string | number) => (filters.push((r) => {
    const x = pathGet(r, col);
    return x !== null && x !== undefined && op(x as string | number, v);
  }), b);
  const b: Record<string, unknown> = {};
  b.select = (columns: string, opts?: { count?: string }) => {
    selectLog.push({ table, columns });
    count = opts?.count === "exact";
    return b;
  };
  b.eq = (col: string, v: unknown) => (filters.push((r) => pathGet(r, col) === v), b);
  b.is = (col: string, v: unknown) => (filters.push((r) => (pathGet(r, col) ?? null) === v), b);
  b.in = (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(pathGet(r, col))), b);
  b.gt = (col: string, v: string | number) => cmp(col, (a, c) => a > c)(v);
  b.gte = (col: string, v: string | number) => cmp(col, (a, c) => a >= c)(v);
  b.lt = (col: string, v: string | number) => cmp(col, (a, c) => a < c)(v);
  b.lte = (col: string, v: string | number) => cmp(col, (a, c) => a <= c)(v);
  b.order = (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), b);
  b.limit = (n: number) => ((limit = n), b);
  b.range = (from: number, to: number) => ((range = [from, to]), b);
  b.maybeSingle = () => ((single = true), Promise.resolve(run()));
  b.then = (resolve: (v: unknown) => unknown) => resolve(run());
  return b;
}

const supabase = { auth: { getUser: async () => ({ data: { user: { id: USER } } }) }, from: (t: string) => builder(t) };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/impersonation", () => ({ getViewContext: async () => ({ effectiveUserId: USER, isImpersonating: false }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/student/actions", () => new Proxy({ reconcileStaleFocusSessions: async () => {} }, { get: (t, key) => (key === "then" ? undefined : ((t as Row)[key as string] ?? vi.fn())) }));
vi.mock("@/app/student/_components/daily-tasks/task-board", () => ({ TaskBoard: function TaskBoard() { return null; } }));

import StudentHomePage from "@/app/student/page";
import { TaskBoard } from "@/app/student/_components/daily-tasks/task-board";
import { RemainingSessionsCard } from "@/app/student/_components/remaining-sessions-card";
import { sessionBalance } from "@/lib/session-balance";

function find(node: ReactNode, type: unknown): ReactElement | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((n) => find(n, type)).find(Boolean) ?? null;
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ children?: ReactNode }>;
  return el.type === type ? el : find(el.props.children, type);
}

const task = (id: string, over: Row = {}): Row => ({
  id,
  student_id: USER,
  task_date: "2026-10-06",
  task_type: "question_bank",
  title: id,
  status: "pending",
  analysis_pending: false,
  tracked_duration_seconds: 0,
  order_index: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T10:00:00Z") }));
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  selectLog.length = 0;
  db.profiles = [{ id: USER, exam_type: "YKS", schedule_routine_row_heights_px: [120], schedule_task_row_heights_px: [150] }];
  db.progress_locks = [];
  db.student_fixed_tasks = [{ id: "f1", student_id: USER, title: "Okul", day_of_week: 0, start_time: "08:00", end_time: "15:00", description: null }];
  db.focus_session_reviews = [];
  db.coaching_sessions = [];
  db.task_resources = [];
  db.student_tasks = [];
});

async function load() {
  const page = await StudentHomePage();
  const board = find(page, TaskBoard);
  expect(board).not.toBeNull();
  return { page, props: board!.props as Record<string, unknown> };
}

describe("student home data", () => {
  it("shows this week's tasks and the older pending-analysis ones, each with its resource names", async () => {
    db.student_tasks = [
      task("week-a", { task_date: "2026-10-06" }),
      task("yesterday", { task_date: "2026-10-05" }),
      task("old-analysis", { task_date: "2026-09-01", analysis_pending: true }),
      task("old-plain", { task_date: "2026-09-02" }),
      task("far-future", { task_date: "2026-12-30" }),
    ];
    db.task_resources = [
      { task_id: "week-a", order_index: 1, student_tasks: { student_id: USER, task_date: "2026-10-06", analysis_pending: false }, student_resources: { name: "Kaynak B" } },
      { task_id: "week-a", order_index: 0, student_tasks: { student_id: USER, task_date: "2026-10-06", analysis_pending: false }, student_resources: { name: "Kaynak A" } },
      { task_id: "old-analysis", order_index: 0, student_tasks: { student_id: USER, task_date: "2026-09-01", analysis_pending: true }, student_resources: { name: "Eski Kaynak" } },
      { task_id: "old-plain", order_index: 0, student_tasks: { student_id: USER, task_date: "2026-09-02", analysis_pending: false }, student_resources: { name: "Hiç görünmez" } },
    ];
    const { props } = await load();
    const tasks = props.initialTasks as { id: string; resource_names: string[]; week_locked: boolean }[];
    expect(tasks.map((t) => t.id).sort()).toEqual(["old-analysis", "week-a", "yesterday"]);
    expect(tasks.find((t) => t.id === "week-a")!.resource_names).toEqual(["Kaynak A", "Kaynak B"]);
    expect(tasks.find((t) => t.id === "old-analysis")!.resource_names).toEqual(["Eski Kaynak"]);
    expect(tasks.find((t) => t.id === "yesterday")!.resource_names).toEqual([]);
    expect(tasks.every((t) => t.week_locked === false)).toBe(true);
  });

  it("sums the all-time tracked minutes over the whole history, past the API's 1000-row cap", async () => {
    // 1500 tasks with a minute each, plus ones that never tracked anything
    db.student_tasks = [
      ...Array.from({ length: 1500 }, (_, i) => task(`t${String(i).padStart(4, "0")}`, { task_date: "2026-03-01", tracked_duration_seconds: 60 })),
      ...Array.from({ length: 300 }, (_, i) => task(`z${i}`, { task_date: "2026-03-02", tracked_duration_seconds: 0 })),
    ];
    const { props } = await load();
    expect(props.allTimeTrackedMinutes).toBe(1500);
  });

  it("counts the session balance over every session, past the cap", async () => {
    const sessions = [
      ...Array.from({ length: 1100 }, (_, i) => ({ id: `s${String(i).padStart(4, "0")}`, student_id: USER, scheduled_at: `2025-01-01T${String(i % 24).padStart(2, "0")}:00:00Z`, is_paid: true, outcome: i % 2 === 0 ? "completed" : "pending" })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, student_id: USER, scheduled_at: "2025-06-01T10:00:00Z", is_paid: false, outcome: "completed" })),
    ];
    db.coaching_sessions = sessions;
    const { page } = await load();
    const card = find(page, RemainingSessionsCard);
    expect(card!.props).toMatchObject({ remaining: sessionBalance(sessions.map((s) => ({ is_paid: s.is_paid, outcome: s.outcome as "completed" | "pending" }))).remaining });
  });

  it("freezes tasks before the latest lock day and reads the progress window from the cycles", async () => {
    db.progress_locks = [{ student_id: USER, period_start: "2026-09-15", locked_at: "2026-10-01T09:00:00Z" }];
    db.student_tasks = [
      task("locked-pending", { task_date: "2026-09-20", analysis_pending: true }),
      task("open-week", { task_date: "2026-10-06" }),
      task("in-previous-cycle", { task_date: "2026-09-16" }),
      task("too-old", { task_date: "2026-06-01" }),
    ];
    const { props } = await load();
    const tasks = props.initialTasks as { id: string; week_locked: boolean }[];
    expect(tasks.find((t) => t.id === "locked-pending")!.week_locked).toBe(true);
    expect(tasks.find((t) => t.id === "open-week")!.week_locked).toBe(false);
    expect(props.currentCycle).toEqual({ start: "2026-10-01", end: "2026-10-06" });
    expect(props.previousCycle).toEqual({ start: "2026-09-15", end: "2026-09-30" });
    const progress = (props.progressExtraTasks as { id: string }[]).map((t) => t.id).sort();
    expect(progress).toEqual(["in-previous-cycle", "locked-pending", "open-week"]); // 2026-09-20 also lies in the previous cycle; "too-old" does not
    expect(props.todayLocked).toBe(false);
  });

  it("passes the profile's row heights, the fixed tasks and the focus reviews through", async () => {
    db.focus_session_reviews = [
      { id: "r1", student_id: USER, seconds: 25000, status: "pending", approved_seconds: null, ended_at: "2026-10-05T10:00:00Z", reviewed_at: null, student_dismissed_at: null, student_tasks: { title: "Paragraf" } },
      { id: "r2", student_id: USER, seconds: 100, status: "approved", approved_seconds: 100, ended_at: "2026-06-01T10:00:00Z", reviewed_at: "2026-06-02T10:00:00Z", student_dismissed_at: null, student_tasks: { title: "Eski" } },
      { id: "r3", student_id: USER, seconds: 100, status: "pending", approved_seconds: null, ended_at: "2026-10-04T10:00:00Z", reviewed_at: null, student_dismissed_at: "2026-10-05T10:00:00Z", student_tasks: { title: "Kapatılmış" } },
    ];
    const { page, props } = await load();
    expect(props.initialRoutineRowHeights).toEqual([120]);
    expect(props.initialTaskRowHeights).toEqual([150]);
    expect((props.fixedTasks as { id: string }[]).map((f) => f.id)).toEqual(["f1"]);
    expect(JSON.stringify(page, (_k, v) => (typeof v === "function" ? undefined : v))).toContain("Paragraf");
    expect(JSON.stringify(page, (_k, v) => (typeof v === "function" ? undefined : v))).not.toContain("Kapatılmış");
    expect(JSON.stringify(page, (_k, v) => (typeof v === "function" ? undefined : v))).not.toContain("Eski");
  });

  it("never reads a task with select('*') -- only named columns", async () => {
    db.student_tasks = [task("a")];
    await load();
    const taskSelects = selectLog.filter((s) => s.table === "student_tasks");
    expect(taskSelects.length).toBeGreaterThan(0);
    expect(taskSelects.every((s) => s.columns !== "*")).toBe(true);
    expect(selectLog.filter((s) => s.table === "student_fixed_tasks").every((s) => s.columns !== "*")).toBe(true);
  });
});
