import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { fetchStopwatchCompetitionRoster, type StopwatchRosterRow } from "@/app/coach/actions";
import { StopwatchRosterTable } from "@/app/coach/stopwatch/_components/stopwatch-roster-table";

// --- the SQL (migration 0132) ------------------------------------------------------------------------------------------------
const sql = readFileSync(new URL("../supabase/migrations/0132_coach_stopwatch_global_ranking.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("as $$"), sql.indexOf("$$;"));
const studentSql = readFileSync(new URL("../supabase/migrations/0131_stopwatch_ranking_across_coaches.sql", import.meta.url), "utf8");
const studentBody = studentSql.slice(studentSql.indexOf("as $$"), studentSql.indexOf("$$;"));

describe("get_coach_stopwatch_ranking (migration 0132): the student's own daily rank", () => {
  it("is limited to the coach themself (or an admin) and takes no month any more", () => {
    expect(body).toMatch(/p_coach_id = \(select auth\.uid\(\)\) or public\.is_admin\(\)/);
    expect(sql).toContain("create or replace function public.get_coach_stopwatch_ranking(p_coach_id uuid)");
    expect(sql).toContain("drop function if exists public.get_coach_stopwatch_ranking(uuid, date, date);");
    expect(body).not.toContain("p_month");
  });

  it("measures TODAY on the same logical day and with the same expression as the student's get_daily_stopwatch_ranking", () => {
    for (const piece of [
      "((now() at time zone 'utc') + interval '1 hour')::date as logical_today",
      "st.task_date = (select logical_today from bounds)",
      "(coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int",
    ]) {
      expect(body, piece).toContain(piece);
      expect(studentBody, piece).toContain(piece.replace(/^st\.task_date/, "st.task_date").replace("(coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int", "(coalesce(sum(st.tracked_duration_seconds), 0) / 60)::int"));
    }
    // not the month, not tracked_duration_minutes
    expect(body).not.toContain("tracked_duration_minutes");
    expect(body).not.toContain("monthly");
  });

  it("pools like the student ranking: active students with a coach, same group name (null-safe), ranked with rank() and the 0-minutes-last rule", () => {
    expect(body).toContain("p.competition_status = 'active'");
    expect(body).toContain("lower(btrim(g.name))");
    expect(body).toMatch(/rank\(\) over \(partition by t\.group_key order by t\.daily_minutes desc\)/);
    expect(body).toMatch(/when r\.daily_minutes = 0 then r\.pool_size/);
    expect(studentBody).toMatch(/rank\(\) over \(order by total_minutes desc\)/);
    expect(studentBody).toContain("when (select total_minutes from my_total) = 0");
  });

  it("ranks over the WHOLE pool first and only then drops the other coach's students -- so a hidden 3rd leaves ranks 1, 2, 4, 5", () => {
    expect(body.indexOf("rank() over")).toBeGreaterThan(-1);
    // the visibility filter is applied after the ranked CTE, never inside it
    expect(body.indexOf("where r.is_own")).toBeGreaterThan(body.indexOf("rank() over"));
    expect(body).toMatch(/where r\.is_own\s+or \(r\.raw_rank = 1 and r\.daily_minutes > 0\)/);
    // pools are only those the coach has students in; nobody of another coach below 1st is returned
    expect(body).toContain("select distinct group_key from members where is_own");
  });
});

// --- the roster fetch ----------------------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;

function fakeSupabase(opts: { rank: Row[] | null; rankError?: unknown; own?: string[]; tasks?: Row[] }) {
  const calls: { rpc: { name: string; args: Record<string, unknown> }[]; taskGte: string[]; taskPages: number } = { rpc: [], taskGte: [], taskPages: 0 };
  const own = opts.own ?? ["own1", "own2", "own3"];
  const tables: Record<string, Row[]> = {
    coach_students: own.map((student_id) => ({ student_id })),
    profiles: own.map((id, i) => ({
      id,
      full_name: `Öğrenci ${i + 1}`,
      sinif_sube: "11-A",
      active_focus_heartbeat_at: null,
      last_active_at: null,
      competition_group_id: "g1",
      competition_status: id === "passive1" ? "passive" : "active",
      student_groups: { name: "Lise" },
    })),
    student_tasks: opts.tasks ?? [],
  };
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      let window: [number, number] | null = null;
      for (const m of ["select", "eq", "in", "lte", "order"]) b[m] = () => b;
      b.gte = (_col: string, value: string) => {
        if (table === "student_tasks") calls.taskGte.push(value);
        return b;
      };
      b.range = (from: number, to: number) => {
        window = [from, to];
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) => {
        const all = tables[table] ?? [];
        if (table === "student_tasks" && window) calls.taskPages += 1;
        return resolve({ data: window ? all.slice(window[0], window[1] + 1) : all, error: null, count: all.length });
      };
      return b;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.rpc.push({ name, args });
      return Promise.resolve({ data: opts.rank, error: opts.rankError ?? null });
    },
  };
  return { client, calls };
}

const r = (student_id: string, is_own: boolean, daily_minutes: number, global_rank: number, pool_size = 9): Row => ({
  student_id,
  full_name: `Ad ${student_id}`,
  is_own,
  group_name: "Lise",
  daily_minutes,
  global_rank,
  pool_size,
});

describe("fetchStopwatchCompetitionRoster: what it reads", () => {
  const manyTasks = (n: number, date: string): Row[] =>
    Array.from({ length: n }, (_, i) => ({ id: i, student_id: "own1", task_date: date, tracked_duration_minutes: 1 }));

  it("the month's task rows are read in pages, so a long month is not cut at 1000 rows (weekly / monthly totals add up)", async () => {
    const monthStart = "2026-10-01";
    const { client, calls } = fakeSupabase({ rank: [], tasks: manyTasks(2500, monthStart) });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(calls.taskPages).toBe(3);
    expect(roster.find((x) => x.studentId === "own1")?.monthlyMinutes).toBe(2500);
  });

  it("dailyOnly (the coach layout's widget) reads only from today's logical day on -- not the month -- and still returns today's minutes", async () => {
    const full = fakeSupabase({ rank: [] });
    await fetchStopwatchCompetitionRoster(full.client as never, "coachA", 2026, 10);
    const daily = fakeSupabase({ rank: [] });
    const rows = await fetchStopwatchCompetitionRoster(daily.client as never, "coachA", 2026, 10, { dailyOnly: true });
    // the lower bound of the task read is the logical day itself (the page reads from the start of the week/month)
    expect(full.calls.taskGte[0] <= daily.calls.taskGte[0]).toBe(true);
    expect(daily.calls.taskGte[0]).toBe(new Date(Date.now() + 3600_000).toISOString().slice(0, 10));
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.weeklyMinutes === 0 && x.monthlyMinutes === 0)).toBe(true);
  });
});

describe("fetchStopwatchCompetitionRoster: the global daily rank, kept as the database gave it", () => {
  it("asks the ranking function for this coach only (the rank does not depend on the month picked)", async () => {
    const { client, calls } = fakeSupabase({ rank: [] });
    await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(calls.rpc).toEqual([{ name: "get_coach_stopwatch_ranking", args: { p_coach_id: "coachA" } }]);
    await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 3);
    expect(calls.rpc[1].args).toEqual({ p_coach_id: "coachA" });
  });

  it("pool 1-a, 2-a, 3-b, 4-a, 5-a: the coach sees ranks 1, 2, 4, 5 -- the hidden 3rd leaves a gap, 4-a is NOT renumbered to 3", async () => {
    const { client } = fakeSupabase({
      own: ["a1", "a2", "a4", "a5"],
      // the database returns the coach's own rows and (only) the pool's 1st place student of the other coach -- here the 1st is
      // the coach's own, so b3 is not returned at all
      rank: [r("a1", true, 300, 1), r("a2", true, 240, 2), r("a4", true, 90, 4), r("a5", true, 60, 5)],
    });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster.map((x) => [x.studentId, x.globalRank])).toEqual([["a1", 1], ["a2", 2], ["a4", 4], ["a5", 5]]);
    expect(roster.some((x) => x.isOtherCoachStudent)).toBe(false);
    expect(roster.find((x) => x.studentId === "a4")?.poolSize).toBe(9);
  });

  it("when the other coach's student is 1st, they are shown as 1st and the coach's students keep their absolute ranks (2, 3, 5)", async () => {
    const { client } = fakeSupabase({
      own: ["a2", "a3", "a5"],
      rank: [r("b1", false, 400, 1), r("a2", true, 240, 2), r("a3", true, 180, 3), r("a5", true, 60, 5)],
    });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster.map((x) => [x.studentId, x.globalRank, x.isOtherCoachStudent])).toEqual([
      ["b1", 1, true],
      ["a2", 2, false],
      ["a3", 3, false],
      ["a5", 5, false],
    ]);
    expect(roster[0]).toMatchObject({ fullName: "Ad b1", dailyMinutes: 400, competitionGroupName: "Lise" });
  });

  it("is listed in rank order whatever the order the rows arrive in, and never renumbers", async () => {
    const { client } = fakeSupabase({ own: ["a5", "a2", "a4"], rank: [r("a5", true, 60, 5), r("a2", true, 240, 2), r("a4", true, 90, 4)] });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster.map((x) => x.globalRank)).toEqual([2, 4, 5]);
  });

  it("an own student's minutes today are the ranking's own figure (what their widget shows)", async () => {
    const { client } = fakeSupabase({ own: ["a1"], rank: [r("a1", true, 77, 3)] });
    const [row] = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(row).toMatchObject({ dailyMinutes: 77, globalRank: 3 });
  });

  it("a passive student has no rank and comes after the ranked ones", async () => {
    const { client } = fakeSupabase({ own: ["a1", "passive1"], rank: [r("a1", true, 10, 4)] });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster.map((x) => [x.studentId, x.globalRank])).toEqual([["a1", 4], ["passive1", null]]);
  });

  it("when the ranking cannot be read the page still works: own students, no ranks, nobody else's", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase({ rank: null, rankError: { code: "42883", message: "function does not exist" } });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster).toHaveLength(3);
    expect(roster.every((x) => x.globalRank === null && !x.isOtherCoachStudent)).toBe(true);
  });
});

// --- the table ----------------------------------------------------------------------------------------------------------------
const base: Omit<StopwatchRosterRow, "studentId" | "fullName" | "dailyMinutes" | "globalRank" | "isOtherCoachStudent"> = {
  sinifSube: "11-A",
  weeklyMinutes: 120,
  monthlyMinutes: 900,
  activeFocusHeartbeatAt: null,
  lastActiveAt: null,
  competitionGroupId: "g1",
  competitionGroupName: "Lise",
  competitionStatus: "active",
  poolSize: 9,
};

describe("the coach's stopwatch table", () => {
  const roster: StopwatchRosterRow[] = [
    { ...base, studentId: "other1", fullName: "Başka Koçun Öğrencisi", dailyMinutes: 400, globalRank: 1, isOtherCoachStudent: true, competitionGroupId: null, monthlyMinutes: 0, weeklyMinutes: 0 },
    { ...base, studentId: "own2", fullName: "Benim Öğrencim", dailyMinutes: 240, globalRank: 2, isOtherCoachStudent: false },
    { ...base, studentId: "own4", fullName: "Dördüncü Öğrencim", dailyMinutes: 90, globalRank: 4, isOtherCoachStudent: false },
    { ...base, studentId: "own5", fullName: "Beşinci Öğrencim", dailyMinutes: 60, globalRank: 5, isOtherCoachStudent: false },
  ];
  const html = renderToStaticMarkup(
    <StopwatchRosterTable initialRoster={roster} initialGroups={[{ id: "g1", name: "Lise" } as never]} initialYear={2026} initialMonth={10} />,
  );

  it("shows each rank exactly as given -- 1, 2, 4, 5 -- with the gap where the hidden student would be", () => {
    expect(html).toContain(">Sıra<");
    const ranks = [...html.matchAll(/font-semibold tabular-nums">(\d+)<\/td><td/g)].map((m) => Number(m[1]));
    expect(ranks).toEqual([1, 2, 4, 5]);
    expect(html).toMatch(/tabular-nums">4<\/td><td[^>]*>Dördüncü Öğrencim/);
    expect(html).not.toMatch(/tabular-nums">3<\/td><td/);
  });

  it("shows the other coach's 1st place student -- as 1st, labelled, with today's minutes, without any controls -- and the trophy goes to them", () => {
    expect(html).toContain("Başka Koçun Öğrencisi");
    expect(html).toContain("Diğer koçun öğrencisi");
    expect(html).toContain("data-other-coach-winner");
    expect(html.match(/🏆/g)).toHaveLength(1);
    expect(html.indexOf("🏆")).toBeLessThan(html.indexOf("Benim Öğrencim"));
    const tbody = html.slice(html.indexOf("<tbody"));
    expect(tbody.match(/<select/g)).toHaveLength(3); // the three own students only
    expect(tbody.match(/title="Yarışmadan çıkarmak için tıkla"/g)).toHaveLength(3);
    expect(tbody).toContain("6 sa 40 dk"); // 400 minutes today
  });

  it("without another coach's winner there is no extra row, and a coach's own #1 gets the trophy", () => {
    const own = roster.filter((x) => !x.isOtherCoachStudent).map((x) => (x.studentId === "own2" ? { ...x, globalRank: 1 } : x));
    const ownHtml = renderToStaticMarkup(
      <StopwatchRosterTable initialRoster={own} initialGroups={[{ id: "g1", name: "Lise" } as never]} initialYear={2026} initialMonth={10} />,
    );
    expect(ownHtml).not.toContain("Diğer koçun öğrencisi");
    expect(ownHtml.match(/🏆/g)).toHaveLength(1);
    expect(ownHtml.indexOf("🏆")).toBeLessThan(ownHtml.indexOf("Benim Öğrencim") + 1);
  });

  it("no trophy for a rank-1 student with no time today (a solo pool that has not started)", () => {
    const idle: StopwatchRosterRow[] = [{ ...base, studentId: "own1", fullName: "Henüz Başlamadı", dailyMinutes: 0, globalRank: 1, isOtherCoachStudent: false, poolSize: 1 }];
    expect(renderToStaticMarkup(<StopwatchRosterTable initialRoster={idle} initialGroups={[]} initialYear={2026} initialMonth={10} />)).not.toContain("🏆");
  });
});
