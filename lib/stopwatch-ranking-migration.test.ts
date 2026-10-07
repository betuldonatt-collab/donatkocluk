import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The ranking itself runs in Postgres (get_daily_stopwatch_ranking, migration 0131), which these tests cannot execute; they pin
// down the shape of the SQL so the cross-coach pooling cannot silently regress to a per-coach (or per-group-id) ranking.
const sql = readFileSync(new URL("../supabase/migrations/0131_stopwatch_ranking_across_coaches.sql", import.meta.url), "utf8");
// the function body only (the header comments mention the old behaviour in words)
const body = sql.slice(sql.indexOf("as $$"), sql.indexOf("$$;"));

describe("get_daily_stopwatch_ranking (migration 0131)", () => {
  it("no longer filters the pool by the caller's coach", () => {
    expect(body).not.toMatch(/coach_id\s*=/);
    expect(body).not.toContain("cs.coach_id");
  });

  it("pools by group NAME (case-insensitive, trimmed), null-safe so ungrouped students share one pool across coaches", () => {
    expect(body).toContain("lower(btrim(g.name))");
    expect(body).toMatch(/is not distinct from \(select group_key from me\)/);
    // not by the coach-owned group id any more
    expect(body).not.toMatch(/competition_group_id is not distinct from/);
  });

  it("keeps the active-status rule, the coach-link requirements, and the unchanged result shape", () => {
    expect(body).toContain("p.competition_status = 'active'");
    expect(body).toMatch(/exists \(select 1 from public\.coach_students cs where cs\.student_id = p\.id\)/);
    expect(body).toMatch(/exists \(select 1 from public\.coach_students cs where cs\.student_id = auth\.uid\(\)\)/);
    for (const column of ["my_rank int", "my_total_minutes int", "top_student_name text", "top_student_total_minutes int", "participant_count int", "yesterday_winner_name text", "yesterday_winner_total_minutes int"]) {
      expect(sql).toContain(column);
    }
  });

  it("keeps the measure, the logical day and the zero-minutes-last rule of 0095", () => {
    expect(body).toContain("tracked_duration_seconds");
    expect(body).toContain("interval '1 hour'");
    expect(body).toContain("when (select total_minutes from my_total) = 0");
  });

  it("uses the same pool for yesterday's winner as for today's ranking", () => {
    expect(body.match(/from pool/g)?.length).toBe(2);
  });
});
