import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { ChartsTab } from "@/app/coach/students/[id]/_components/charts-tab";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import {
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  branchExamCourses,
  TYT_COURSES,
  type Track,
} from "./curriculum";

// A Branş Denemesi assigned as "TYT Fen" / "TYT Sosyal" / "TYT Matematik" (or an AYT combined one) is saved under the combined course's
// id. The Grafikler chart's picker used to be built from the single-subject lists only, so those exams could never be selected.

const TRACKS: Track[] = ["sayisal", "ea", "sozel"];
const ids = (courses: { id: string }[]) => courses.map((c) => c.id);

describe("branchExamCourses: the one list every Branş Denemesi picker uses", () => {
  it("TYT: the combined courses first (Sosyal, Matematik, Fen), then every single-subject course", () => {
    const list = ids(branchExamCourses("tyt"));
    expect(list.slice(0, 3)).toEqual(["tyt-sosyal-macro", "tyt-matematik-macro", "tyt-fen-macro"]);
    expect(list.slice(3)).toEqual(ids(TYT_COURSES));
  });

  it("AYT: each field's combined courses first, then that field's single-subject courses", () => {
    expect(ids(branchExamCourses("ayt", "sayisal")).slice(0, 2)).toEqual(["ayt-matematik-macro", "ayt-fen-sayisal-macro"]);
    expect(ids(branchExamCourses("ayt", "ea")).slice(0, 2)).toEqual(["ayt-matematik-macro", "ayt-sos1-macro"]);
    expect(ids(branchExamCourses("ayt", "sozel")).slice(0, 2)).toEqual(["ayt-sos1-macro", "ayt-sos2-sozel-macro"]);
    for (const t of TRACKS) {
      const list = ids(branchExamCourses("ayt", t));
      expect(list.slice(-AYT_COURSES_BY_TRACK[t].length)).toEqual(ids(AYT_COURSES_BY_TRACK[t]));
    }
  });

  it("no id appears twice in any list", () => {
    for (const list of [branchExamCourses("tyt"), ...TRACKS.map((t) => branchExamCourses("ayt", t))]) {
      expect(new Set(ids(list)).size).toBe(list.length);
    }
  });

  it("every combined course that exists is reachable through some list -- a new one can never be left out of the pickers", () => {
    const reachable = new Set([...ids(branchExamCourses("tyt")), ...TRACKS.flatMap((t) => ids(branchExamCourses("ayt", t)))]);
    for (const macro of BRANCH_EXAM_MACRO_COURSES) expect(reachable.has(macro.id), macro.id).toBe(true);
  });
});

describe("coach Grafikler: the Branş Denemesi picker", () => {
  const exam = (id: string, courseId: string, correct: number, wrong: number): DetailTask =>
    ({
      id,
      task_date: "2026-10-05",
      task_type: "branch_exam",
      title: "Branş Denemesi",
      course_id: courseId,
      correct_count: correct,
      wrong_count: wrong,
      empty_count: 0,
      duration_minutes: 40,
      subject_scores: null,
    }) as unknown as DetailTask;

  const render = (branchExams: DetailTask[]) =>
    renderToStaticMarkup(
      <ChartsTab
        studentId="s1"
        paragrafEntries={[]}
        generalExams={[]}
        branchExams={branchExams}
        examMistakes={[]}
        weekDays={[]}
        courseResourceData={{}}
        chartRange={{ type: "custom", startDate: "2026-10-01", endDate: "2026-10-31" }}
        initialExamMode="brans"
      />,
    );

  it("offers TYT Sosyal, TYT Matematik and TYT Fen (the bug), above the single-subject courses", () => {
    const html = render([]);
    const select = html.slice(html.indexOf('aria-label="Branş dersi seç"'));
    const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options.slice(0, 3)).toEqual([
      ["tyt-sosyal-macro", "TYT Sosyal"],
      ["tyt-matematik-macro", "TYT Matematik (Matematik + Geometri)"],
      ["tyt-fen-macro", "TYT Fen"],
    ]);
    // the single-subject ones are still there -- except the plain Matematik, which is part of the combined entry above (analysis views
    // list TYT Matematik once; lib/curriculum branchExamAnalysisCourses)
    const values = options.map((o) => o[0]);
    for (const id of ids(TYT_COURSES).filter((id) => id !== "tyt-matematik")) expect(values).toContain(id);
    expect(values).not.toContain("tyt-matematik");
  });

  it("plots an exam saved under a combined course (the first listed one is selected by default)", () => {
    const html = render([exam("b1", "tyt-sosyal-macro", 20, 4)]);
    expect(html).toContain("TYT Sosyal branş denemesi net ve süre değişimi");
    // net = 20 - 4/4 = 19: the chart's top axis label and one plotted point
    expect(html).toContain(">19</text>");
    expect(html).toContain("<circle");
  });

  it("an exam under a different combined course does not show up in this selection", () => {
    const html = render([exam("b2", "tyt-fen-macro", 30, 8)]);
    expect(html).toContain("TYT Sosyal branş denemesi");
    // net 30 - 8/4 = 28 is not on this chart
    expect(html).not.toContain(">28</text>");
    expect(html).not.toContain("<circle");
  });
});

describe("guard: no picker is assembled by hand any more", () => {
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === "node_modules" || name === ".next") continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|ts)$/.test(name) && !/\.test\./.test(name)) {
        const src = readFileSync(full, "utf8");
        // a hand-built "macros + singles" list is exactly where a forgotten half comes from
        if (/\.\.\.\s*(?:TYT_BRANCH_EXAM_MACRO_COURSES|AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK\[[^\]]+\])\s*,\s*\.\.\.\s*(?:TYT_COURSES|AYT_COURSES_BY_TRACK)/.test(src)) {
          if (!full.split("\\").join("/").endsWith("lib/curriculum/index.ts")) offenders.push(full);
        }
      }
    }
  };
  it("only lib/curriculum builds the combined + single-subject list", () => {
    walk(join(root, "app"));
    walk(join(root, "components"));
    walk(join(root, "lib"));
    expect(offenders).toEqual([]);
  });

  it("the Branş pickers of both panels go through branchExamAnalysisCourses (branchExamCourses with TYT Matematik listed once)", () => {
    for (const file of [
      "app/coach/students/[id]/_components/charts-tab.tsx",
      "app/coach/students/[id]/_components/coach-exam-analysis-section.tsx",
      "app/student/deneme-analizleri/brans/brans-analysis-client.tsx",
    ]) {
      expect(readFileSync(join(root, file), "utf8"), file).toContain("branchExamAnalysisCourses(");
    }
  });

  // The topic maps are the opposite case: one merged map per ATOMIC subject (a combined exam's marks are folded onto
  // Fizik / Kimya / Biyoloji by lib/gelisim-haritasi.ts), so they must NOT offer the combined chips.
  it("the topic maps (Gelişim Haritası x2, Konu Performans Haritası) list the atomic subjects only", () => {
    for (const file of [
      "app/coach/students/[id]/_components/gelisim-haritasi-tab.tsx",
      "app/coach/students/[id]/_components/topic-performance-map.tsx",
      "app/student/deneme-analizleri/_components/gelisim-haritasi.tsx",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      expect(src, file).not.toContain("branchExamCourses(");
      expect(src, file).not.toMatch(/tytCourses=|aytCoursesFor=/);
    }
  });
});
