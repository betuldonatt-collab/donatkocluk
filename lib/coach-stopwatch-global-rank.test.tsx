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

describe("get_coach_stopwatch_ranking (migration 0132)", () => {
  it("is limited to the coach themself (or an admin)", () => {
    expect(body).toMatch(/p_coach_id = \(select auth\.uid\(\)\) or public\.is_admin\(\)/);
  });

  it("ranks inside the pool -- active students of ANY coach in the same group name -- partitioned by the group name key", () => {
    expect(body).toContain("lower(btrim(g.name))");
    expect(body).toMatch(/rank\(\) over \(partition by t\.group_key order by t\.monthly_minutes desc\)/);
    expect(body).toContain("p.competition_status = 'active'");
  });

  it("returns the coach's own students plus ONLY a pool's 1st place student(s) of someone else -- never 2nd, 3rd, ...", () => {
    expect(body).toMatch(/where r\.is_own\s+or \(r\.raw_rank = 1 and r\.monthly_minutes > 0\)/);
    // pools are only those the coach has students in
    expect(body).toContain("select distinct group_key from members where is_own");
  });

  it("measures the month with the same column and window the coach's monthly column uses; 0 minutes = last place", () => {
    expect(body).toContain("tracked_duration_minutes");
    expect(body).toMatch(/st\.task_date >= p_month_start and st\.task_date < p_month_end/);
    expect(body).toMatch(/when r\.monthly_minutes = 0 then r\.pool_size/);
  });
});

// --- the roster fetch ----------------------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;

function fakeSupabase(opts: { rank: Row[] | null; rankError?: unknown }) {
  const calls: { rpc: { name: string; args: Record<string, unknown> }[] } = { rpc: [] };
  const own = ["own1", "own2", "own3"];
  const tables: Record<string, Row[]> = {
    coach_students: own.map((student_id) => ({ student_id })),
    profiles: own.map((id, i) => ({
      id,
      full_name: `Öğrenci ${i + 1}`,
      sinif_sube: "11-A",
      active_focus_heartbeat_at: null,
      last_active_at: null,
      competition_group_id: "g1",
      competition_status: i === 2 ? "passive" : "active",
      student_groups: { name: "Lise" },
    })),
    student_tasks: [],
  };
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "lte", "order"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
      return b;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.rpc.push({ name, args });
      return Promise.resolve({ data: opts.rank, error: opts.rankError ?? null });
    },
  };
  return { client, calls };
}

const RANK_ROWS = [
  { student_id: "own1", full_name: "Öğrenci 1", is_own: true, group_name: "Lise", monthly_minutes: 600, global_rank: 5, pool_size: 9 },
  { student_id: "own2", full_name: "Öğrenci 2", is_own: true, group_name: "Lise", monthly_minutes: 0, global_rank: 9, pool_size: 9 },
  { student_id: "other1", full_name: "Başka Koçun Öğrencisi", is_own: false, group_name: "Lise", monthly_minutes: 4000, global_rank: 1, pool_size: 9 },
];

describe("fetchStopwatchCompetitionRoster: global rank and the one visible student of the other coach", () => {
  it("asks the ranking function for this coach and the selected month's window", async () => {
    const { client, calls } = fakeSupabase({ rank: RANK_ROWS });
    await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(calls.rpc).toEqual([{ name: "get_coach_stopwatch_ranking", args: { p_coach_id: "coachA", p_month_start: "2026-10-01", p_month_end: "2026-11-01" } }]);
  });

  it("an own student shows their GLOBAL rank (5th of 9), not their place in the coach's own list", async () => {
    const { client } = fakeSupabase({ rank: RANK_ROWS });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    const own1 = roster.find((r) => r.studentId === "own1")!;
    expect(own1).toMatchObject({ globalRank: 5, poolSize: 9, isOtherCoachStudent: false });
    expect(roster.find((r) => r.studentId === "own2")).toMatchObject({ globalRank: 9, poolSize: 9 });
    // a passive student is not in a pool: no rank
    expect(roster.find((r) => r.studentId === "own3")).toMatchObject({ globalRank: null, poolSize: null, competitionStatus: "passive" });
  });

  it("the other coach's 1st place student is included -- flagged, rank 1 -- and nobody else of theirs", async () => {
    const { client } = fakeSupabase({ rank: RANK_ROWS });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    const others = roster.filter((r) => r.isOtherCoachStudent);
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ studentId: "other1", fullName: "Başka Koçun Öğrencisi", globalRank: 1, monthlyMinutes: 4000, competitionGroupName: "Lise" });
    expect(roster).toHaveLength(4); // 3 own + 1 winner
    // sorted by the month's minutes, the winner on top
    expect(roster[0].studentId).toBe("other1");
  });

  it("when the ranking cannot be read the page still works: own students, no ranks, nobody else's", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase({ rank: null, rankError: { code: "42883", message: "function does not exist" } });
    const roster = await fetchStopwatchCompetitionRoster(client as never, "coachA", 2026, 10);
    expect(roster).toHaveLength(3);
    expect(roster.every((r) => r.globalRank === null && !r.isOtherCoachStudent)).toBe(true);
  });
});

// --- the table ----------------------------------------------------------------------------------------------------------------
const base: Omit<StopwatchRosterRow, "studentId" | "fullName" | "monthlyMinutes" | "globalRank" | "isOtherCoachStudent"> = {
  sinifSube: "11-A",
  dailyMinutes: 30,
  weeklyMinutes: 120,
  activeFocusHeartbeatAt: null,
  lastActiveAt: null,
  competitionGroupId: "g1",
  competitionGroupName: "Lise",
  competitionStatus: "active",
  poolSize: 9,
};

describe("the coach's stopwatch table", () => {
  const roster: StopwatchRosterRow[] = [
    { ...base, studentId: "other1", fullName: "Başka Koçun Öğrencisi", monthlyMinutes: 4000, globalRank: 1, isOtherCoachStudent: true, competitionGroupId: null },
    { ...base, studentId: "own1", fullName: "Benim Öğrencim", monthlyMinutes: 600, globalRank: 5, isOtherCoachStudent: false },
    { ...base, studentId: "own2", fullName: "Diğer Öğrencim", monthlyMinutes: 300, globalRank: 7, isOtherCoachStudent: false },
  ];
  const html = renderToStaticMarkup(
    <StopwatchRosterTable initialRoster={roster} initialGroups={[{ id: "g1", name: "Lise" } as never]} initialYear={2026} initialMonth={10} />,
  );

  it("has a rank column, and each own student shows the GLOBAL rank (5 and 7, not 1 and 2)", () => {
    expect(html).toContain(">Sıra<");
    expect(html).toMatch(/tabular-nums">5<\/td><td[^>]*>Benim Öğrencim/);
    expect(html).toMatch(/tabular-nums">7<\/td><td[^>]*>Diğer Öğrencim/);
  });

  it("shows the other coach's 1st place student -- as 1st, labelled, without any controls -- and the trophy goes to them", () => {
    expect(html).toContain("Başka Koçun Öğrencisi");
    expect(html).toContain("Diğer koçun öğrencisi");
    expect(html).toContain("data-other-coach-winner");
    expect(html.match(/🏆/g)).toHaveLength(1);
    expect(html.indexOf("🏆")).toBeLessThan(html.indexOf("Benim Öğrencim"));
    // only the two own students have the group <select> and the Aktif/Pasif button
    const tbody = html.slice(html.indexOf("<tbody"));
    expect(tbody.match(/<select/g)).toHaveLength(2);
    expect(html.match(/title="Yarışmadan çıkarmak için tıkla"/g)).toHaveLength(2);
  });

  it("without another coach's winner the table lists just the coach's own students", () => {
    const own = roster.filter((r) => !r.isOtherCoachStudent);
    const ownHtml = renderToStaticMarkup(
      <StopwatchRosterTable initialRoster={own} initialGroups={[{ id: "g1", name: "Lise" } as never]} initialYear={2026} initialMonth={10} />,
    );
    expect(ownHtml).not.toContain("Diğer koçun öğrencisi");
    expect(ownHtml).not.toContain("Başka Koçun Öğrencisi");
    expect(ownHtml.match(/🏆/g) ?? []).toHaveLength(0); // nobody of theirs is 1st globally
  });
});
