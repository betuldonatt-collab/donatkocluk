import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/student", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { defaultTaskFormValue, TaskFormFields } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { TaskModal } from "@/app/student/_components/daily-tasks/task-modal";
import type { StudentTask } from "@/app/student/_components/daily-tasks/types";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { findCourseById, macroSourceCourseIds, topicMapCourseId, topicMapTarget } from "./curriculum";
import { MAARIF11_GENEL_DENEME_COURSES, MAARIF11_KAYNAK_COURSES } from "./curriculum/maarif11";
import { flattenSelectionRows } from "./curriculum/rows";
import { MAARIF11_EXAM_QUESTION_TOTAL, MAARIF11_EXAM_SUBJECTS } from "./curriculum/subject-groups";
import { examTrackOf, generalExamTabs } from "./exam-detail";
import {
  GENERAL_EXAM_TRACKS,
  GENERAL_EXAM_TRACK_LABELS,
  MAARIF_GENERAL_EXAM_TRACKS,
  buildGeneralExamTitle,
  coursesForExamSection,
  defaultMaarifGeneralExamTrack,
  generalExamCourseIds,
  generalExamSections,
  parseGeneralExamTitle,
  parseGeneralExamTrack,
  usesLgsNet,
} from "./general-exam-track";
import { computeGelisimHaritasi, type TrialExam } from "./gelisim-haritasi";
import { computeKarneSummary } from "./karne-summary";
import { maarif11NetChart, parseGeneralExamTrack as parentTrack } from "./parent-net-charts";
import type { MaarifGrade } from "./maarif-grade";
import { computeNet } from "./scoring";

// The four Maarif Genel Denemeler -- Maarif TYT, Maarif 11. Sınıf (own exam), Maarif 10. Sınıf, Maarif 9. Sınıf -- and the one module that knows them.

const full = (c: number, w: number, e: number) => ({ correct: c, wrong: w, empty: e });
const tytScores = { turkce: full(30, 5, 5), sosyal: full(15, 3, 2), matematik: full(25, 10, 5), fen: full(10, 6, 4) };

describe("lib/general-exam-track: build, parse, label", () => {
  it("every track builds a title that parses back to it, publisher included", () => {
    for (const track of GENERAL_EXAM_TRACKS) {
      const title = buildGeneralExamTitle(track, " 3D Yayınları ");
      expect(parseGeneralExamTrack(title), track).toBe(track);
      expect(parseGeneralExamTitle(title), track).toEqual({ track, publisher: "3D Yayınları" });
      expect(parseGeneralExamTitle(buildGeneralExamTitle(track, ""))).toEqual({ track, publisher: "" });
    }
  });

  it("the titles of the Maarif kinds", () => {
    expect(buildGeneralExamTitle("mtyt", "X")).toBe("Maarif TYT Genel Deneme - X");
    expect(buildGeneralExamTitle("m11", "X")).toBe("11. SINIF Genel Deneme - X");
    expect(buildGeneralExamTitle("m10", null)).toBe("10. SINIF Genel Deneme");
    expect(buildGeneralExamTitle("m9", undefined)).toBe("9. SINIF Genel Deneme");
    expect(buildGeneralExamTitle(null, "Y")).toBe("TYT Genel Deneme - Y");
  });

  it("anything unrecognised is a plain TYT exam, as it has always been", () => {
    expect(parseGeneralExamTrack("Genel Deneme - X")).toBe("tyt");
    expect(parseGeneralExamTrack("")).toBe("tyt");
  });

  it("a legacy '11. SINIF' title with TYT-shaped scores is Maarif TYT; without them (or with m11_ keys) it is the 11th grade's own exam", () => {
    expect(parseGeneralExamTrack("11. SINIF Genel Deneme - X", tytScores)).toBe("mtyt");
    expect(parseGeneralExamTrack("11. SINIF Genel Deneme - X", null)).toBe("m11");
    expect(parseGeneralExamTrack("11. SINIF Genel Deneme - X", { m11_fen: full(1, 1, 38) })).toBe("m11");
    expect(examTrackOf("11. SINIF Genel Deneme", tytScores)).toBe("mtyt");
  });

  it("the Maarif choice is the four kinds in this order, with their on-screen names; a student's default is its own grade (11th: Maarif TYT)", () => {
    expect(MAARIF_GENERAL_EXAM_TRACKS.map((t) => GENERAL_EXAM_TRACK_LABELS[t])).toEqual(["Maarif TYT", "Maarif 11. Sınıf", "Maarif 10. Sınıf", "Maarif 9. Sınıf"]);
    expect(([7, 9, 10, 11] as const).map(defaultMaarifGeneralExamTrack)).toEqual(["m7", "m9", "m10", "mtyt"]);
  });

  it("only LGS and the 7th grade net 3:1", () => {
    expect(GENERAL_EXAM_TRACKS.filter(usesLgsNet)).toEqual(["lgs", "m7"]);
  });
});

describe("the sections of each Maarif exam", () => {
  it("Maarif TYT is TYT's four sections analysed against the merged Maarif TYT courses", () => {
    expect(generalExamSections("mtyt", null).map((s) => [s.key, s.questions])).toEqual([["turkce", 40], ["sosyal", 20], ["matematik", 40], ["fen", 20]]);
    for (const s of generalExamSections("mtyt", null)) {
      const courses = coursesForExamSection("mtyt", null, s.key);
      expect(courses.length).toBeGreaterThan(0);
      for (const c of courses) expect(c.id.startsWith("maarif-tyt-")).toBe(true);
    }
  });

  it("the 11th grade's own exam: four sections of 40 questions = 160, each with its own courses", () => {
    expect(MAARIF11_EXAM_SUBJECTS.map((s) => s.key)).toEqual(["m11_sosyal1", "m11_matematik", "m11_fen", "m11_sosyal2"]);
    expect(MAARIF11_EXAM_SUBJECTS.every((s) => s.questions === 40)).toBe(true);
    expect(MAARIF11_EXAM_QUESTION_TOTAL).toBe(160);
    expect(generalExamSections("m11", null).every((s) => !("section" in s))).toBe(true);
    for (const s of generalExamSections("m11", null)) {
      expect(coursesForExamSection("m11", null, s.key).length, s.key).toBe(s.courseIds.length);
    }
  });

  it("Tarih and Coğrafya are listed under BOTH Sosyal sections, as separate courses with topic ids of their own", () => {
    const sosyal1 = coursesForExamSection("m11", null, "m11_sosyal1").map((c) => c.name);
    const sosyal2 = coursesForExamSection("m11", null, "m11_sosyal2").map((c) => c.name);
    expect(sosyal1).toEqual(["Türk Dili ve Edebiyatı", "Tarih-1", "Coğrafya-1"]);
    expect(sosyal2).toEqual(["Tarih-2", "Coğrafya-2", "Felsefe"]);
    expect(coursesForExamSection("m11", null, "m11_fen").map((c) => c.name)).toEqual(["Fizik", "Kimya", "Biyoloji"]);

    const ids = (courseId: string) => findCourseById(courseId)!.units.flatMap((u) => u.topics.map((t) => t.id));
    const t1 = ids("maarif11-gd-tarih-1");
    const t2 = ids("maarif11-gd-tarih-2");
    expect(t1.length).toBeGreaterThan(0);
    expect(t1.length).toBe(t2.length);
    expect(t1.filter((id) => t2.includes(id))).toEqual([]); // independent marks
    // ... and the same topics as the 11th-grade Kaynak course, names included
    const kaynak = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-tarih")!;
    const kaynakNames = kaynak.units.flatMap((u) => u.topics).filter((t) => !/-genel-u\d+$/.test(t.id)).map((t) => t.name);
    expect(findCourseById("maarif11-gd-tarih-2")!.units.flatMap((u) => u.topics.map((t) => t.name))).toEqual(kaynakNames);
  });

  it("every analysis course resolves by id, and offers a mistake picker (selection rows) of its own", () => {
    expect(MAARIF11_GENEL_DENEME_COURSES).toHaveLength(10);
    for (const c of MAARIF11_GENEL_DENEME_COURSES) {
      expect(findCourseById(c.id), c.id).not.toBeNull();
      expect(flattenSelectionRows(c).length, c.id).toBeGreaterThan(0);
    }
  });

  it("the tabs of the popups and the course ids of an exam follow the title", () => {
    expect(generalExamTabs({ title: "11. SINIF Genel Deneme", subject_scores: null }).map((t) => t.key)).toEqual(MAARIF11_EXAM_SUBJECTS.map((s) => s.key));
    expect(generalExamTabs({ title: "Maarif TYT Genel Deneme", subject_scores: null }).map((t) => t.key)).toEqual(["turkce", "sosyal", "matematik", "fen"]);
    expect(generalExamCourseIds("m11", null).every((id) => id.startsWith("maarif11-gd-"))).toBe(true);
    expect(generalExamCourseIds("mtyt", null).every((id) => id.startsWith("maarif-tyt-"))).toBe(true);
  });
});

describe("the per-subject maps fold the exam-specific courses back onto the subject", () => {
  it("topicMapTarget: own-exam marks -> the 11th-grade Kaynak course and topic; combined-exam marks -> the atomic course; anything else is itself", () => {
    const gdTopic = findCourseById("maarif11-gd-tarih-2")!.units[0].topics[0].id;
    const kaynakTopic = findCourseById("maarif11-tarih")!.units[0].topics[0].id;
    expect(topicMapTarget("maarif11-gd-tarih-2", gdTopic)).toEqual({ courseId: "maarif11-tarih", topicId: kaynakTopic });
    expect(topicMapTarget("tyt-fen-macro", "tyt-fizik-u0-t0")).toEqual({ courseId: "tyt-fizik", topicId: "tyt-fizik-u0-t0" });
    expect(topicMapTarget("tyt-fizik", "tyt-fizik-u0-t0")).toEqual({ courseId: "tyt-fizik", topicId: "tyt-fizik-u0-t0" });
    expect(topicMapCourseId("maarif11-gd-cografya-1")).toBe("maarif11-cografya");
    expect(topicMapCourseId("tyt-fizik")).toBe("tyt-fizik");
    expect(macroSourceCourseIds("tyt-fen-macro")).toContain("tyt-fizik");
  });

  const gdTopic = (courseId: string, n = 0) => findCourseById(courseId)!.units[0].topics[n].id;
  const own = (over: Partial<TrialExam>): TrialExam => ({
    id: "m11a",
    task_date: "2026-10-10",
    task_type: "general_exam",
    course_id: null,
    title: "11. SINIF Genel Deneme - X",
    subject_scores: null,
    analysis_pending: false,
    ...over,
  });
  const row = (rows: ReturnType<typeof computeGelisimHaritasi>, courseId: string) => rows.find((r) => r.courseId === courseId && r.topicId === findCourseById(courseId)!.units[0].topics[0].id)!;
  const ids = ["maarif11-tarih", "maarif11-cografya", "maarif11-matematik", "maarif11-fizik", "maarif11-felsefe", "maarif11-turk-dili-ve-edebiyati"];

  it("a Sözel student (Sosyal-1 + Sosyal-2): Tarih-1 and Tarih-2 marks of one exam are ONE trial of Tarih; Matematik and Fen were not sat", () => {
    const exam = own({ subject_scores: { m11_sosyal1: full(20, 10, 10), m11_matematik: full(0, 0, 40), m11_fen: full(0, 0, 40), m11_sosyal2: full(15, 15, 10) } });
    const marks = [
      { task_id: "m11a", course_id: "maarif11-gd-tarih-1", topic_id: gdTopic("maarif11-gd-tarih-1"), status: "wrong" as const },
      { task_id: "m11a", course_id: "maarif11-gd-tarih-2", topic_id: gdTopic("maarif11-gd-tarih-2"), status: "blank" as const },
    ];
    const rows = computeGelisimHaritasi(ids, [exam], marks);
    const tarih = row(rows, "maarif11-tarih");
    expect(tarih.windowSize).toBe(1);
    expect(tarih.count).toBe(1); // marked in both sections, still one exam
    expect(tarih.wrongCount).toBe(1);
    expect(tarih.blankCount).toBe(1);
    expect(row(rows, "maarif11-felsefe").windowSize).toBe(1);
    expect(row(rows, "maarif11-matematik").windowSize).toBe(0);
    expect(row(rows, "maarif11-fizik").windowSize).toBe(0);
    expect(tarih.breakdown).toEqual([{ label: "Genel Deneme", count: 1 }]);
  });

  it("a Sayısal student (Matematik + Fen): the Sosyal courses are not part of that exam", () => {
    const exam = own({ subject_scores: { m11_sosyal1: full(0, 0, 40), m11_matematik: full(30, 5, 5), m11_fen: full(25, 5, 10), m11_sosyal2: full(0, 0, 40) } });
    const rows = computeGelisimHaritasi(ids, [exam], []);
    expect(row(rows, "maarif11-matematik").windowSize).toBe(1);
    expect(row(rows, "maarif11-fizik").windowSize).toBe(1);
    expect(row(rows, "maarif11-tarih").windowSize).toBe(0);
    expect(row(rows, "maarif11-cografya").windowSize).toBe(0);
  });

  it("a Maarif TYT exam is a different kind: it does not feed the 11th-grade Kaynak courses, and vice versa", () => {
    const mtyt = own({ id: "mt", title: "Maarif TYT Genel Deneme - X", subject_scores: tytScores });
    const rows = computeGelisimHaritasi(["maarif-tyt-fizik", "maarif11-fizik"], [mtyt], []);
    expect(rows.find((r) => r.courseId === "maarif-tyt-fizik")!.windowSize).toBe(1);
    expect(rows.find((r) => r.courseId === "maarif11-fizik")!.windowSize).toBe(0);
  });
});

describe("the forms: the Sınav Türü choice", () => {
  const form = (grade: MaarifGrade | null, examType: "YKS" | "LGS" = "YKS") =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <TaskFormFields
          value={{ ...defaultTaskFormValue(examType, grade), taskType: "general_exam" }}
          onChange={() => {}}
          courseResourceData={{}}
          examType={examType}
        />
      </MaarifGradeProvider>,
    );

  it("a 9th / 10th / 11th grader chooses between the four Maarif exams", () => {
    for (const grade of [9, 10, 11] as const) {
      const html = form(grade);
      for (const label of ["Maarif TYT", "Maarif 11. Sınıf", "Maarif 10. Sınıf", "Maarif 9. Sınıf"]) expect(html, `${grade}: ${label}`).toContain(label);
      expect(html).toContain("Sınav Türü");
      expect(html).not.toContain(">AYT<");
    }
  });

  it("opens on the student's own grade; the 11th grade on Maarif TYT", () => {
    expect(defaultTaskFormValue("YKS", 9).generalExamTrack).toBe("m9");
    expect(defaultTaskFormValue("YKS", 10).generalExamTrack).toBe("m10");
    expect(defaultTaskFormValue("YKS", 11).generalExamTrack).toBe("mtyt");
    expect(defaultTaskFormValue("YKS", 7).generalExamTrack).toBe("m7");
    expect(defaultTaskFormValue("YKS", null).generalExamTrack).toBe("tyt");
    expect(defaultTaskFormValue("LGS", null).generalExamTrack).toBe("lgs");
  });

  it("the 7th grade and LGS have no choice; everyone else keeps TYT / AYT", () => {
    expect(form(7)).not.toContain("Sınav Türü");
    expect(form(null, "LGS")).not.toContain("Sınav Türü");
    const yks = form(null);
    expect(yks).toContain("Sınav Türü");
    expect(yks).toContain(">TYT<");
    expect(yks).toContain(">AYT<");
    expect(yks).not.toContain("Maarif");
  });

  it("the student's own add dialog is wired to the same four options", () => {
    const src = readFileSync(new URL("../app/student/_components/daily-tasks/add-custom-task-dialog.tsx", import.meta.url), "utf8");
    expect(src).toContain("MAARIF_GENERAL_EXAM_TRACKS");
    expect(src).toContain("defaultMaarifGeneralExamTrack(maarifGrade)");
  });
});

describe("the student's result entry for the 11th grade's own exam", () => {
  const task = (title: string, subject_scores: StudentTask["subject_scores"] = null): StudentTask =>
    ({
      id: "t1",
      task_date: "2026-10-06",
      task_type: "general_exam",
      title,
      description: null,
      course_id: null,
      topic_id: null,
      resource_id: null,
      resource_names: [],
      total_count: null,
      correct_count: null,
      wrong_count: null,
      empty_count: null,
      start_page: null,
      end_page: null,
      duration_minutes: null,
      tracked_duration_minutes: 0,
      tracked_duration_seconds: 0,
      subject_scores,
      video_links: [],
      completed: false,
      analysis_pending: false,
      evidence_image_paths: [],
      evidence_review_status: "none",
      evidence_photo_status: {},
      status: "pending",
      reason: null,
      note: null,
      is_coach_assigned: true,
      order_index: 0,
      rejected_at: null,
      rejection_reason: null,
      week_locked: false,
    }) as unknown as StudentTask;
  const modal = (t: StudentTask) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={11}>
        <TaskModal task={t} open onOpenChange={() => {}} onSaved={() => {}} examType="YKS" />
      </MaarifGradeProvider>,
    );

  it("shows the four sections of 40 questions", () => {
    const html = modal(task("11. SINIF Genel Deneme - X"));
    for (const label of ["Türk Dili ve Edebiyatı - Sosyal Bilimler 1", "Matematik", "Fen Bilimleri", "Sosyal Bilimler 2"]) expect(html).toContain(label);
    expect((html.match(/\(40 soru\)/g) ?? []).length).toBe(4);
  });

  it("Maarif TYT keeps TYT's sections", () => {
    const html = modal(task("Maarif TYT Genel Deneme - X"));
    expect(html).toContain("(40 soru)");
    expect(html).toContain("(20 soru)");
    expect(html).not.toContain("Sosyal Bilimler 2");
  });

  it("a legacy '11. SINIF' exam with TYT-shaped scores is shown with TYT's sections", () => {
    const html = modal(task("11. SINIF Genel Deneme - X", tytScores));
    expect(html).toContain("(20 soru)");
    expect(html).not.toContain("Sosyal Bilimler 2");
  });
});

describe("the report card and the parent's charts", () => {
  const exam = (title: string, scores: Record<string, ReturnType<typeof full>>, date = "2026-10-12") => ({
    id: `${title}-${date}`,
    task_date: date,
    task_type: "general_exam",
    title,
    subject_scores: scores,
  });
  const summary = (tasks: ReturnType<typeof exam>[]) =>
    computeKarneSummary({
      rangeStart: "2026-10-01",
      rangeEnd: "2026-10-28",
      today: "2026-10-28",
      now: "2026-10-28T10:00:00.000Z",
      tasks: tasks as never,
      events: [],
      maarifGrade: 11,
    });
  const own11 = { m11_sosyal1: full(20, 8, 12), m11_matematik: full(30, 4, 6), m11_fen: full(0, 0, 40), m11_sosyal2: full(0, 0, 40) };

  it("Maarif TYT and Maarif 11. Sınıf are exam groups of their own, each with its own name, sections and 4:1 net", () => {
    const s = summary([exam("Maarif TYT Genel Deneme - A", tytScores), exam("11. SINIF Genel Deneme - B", own11, "2026-10-14")]);
    expect(s.exams.groups.map((g) => [g.key, g.label])).toEqual([
      ["mtyt", "Maarif TYT Genel Deneme"],
      ["m11", "Maarif 11. Sınıf Genel Deneme"],
    ]);
    const m11 = s.exams.groups[1];
    expect(m11.items[0].net).toBeCloseTo(computeNet(50, 12), 5);
    expect(m11.branches.map((b) => [b.key, b.questions])).toEqual([
      ["m11_sosyal1", 40],
      ["m11_matematik", 40],
      ["m11_fen", 40],
      ["m11_sosyal2", 40],
    ]);
  });

  it("the legacy net rows treat Maarif TYT as TYT and never mix the 11th grade's own exam into a TYT / AYT average", () => {
    expect(parentTrack("Maarif TYT Genel Deneme")).toBe("tyt");
    expect(parentTrack("11. SINIF Genel Deneme")).toBe("m11");
    expect(parentTrack("11. SINIF Genel Deneme", tytScores)).toBe("tyt");
  });

  it("the parent gets a chart for the 11th grade's own exam once every section has a result", () => {
    const complete = exam("11. SINIF Genel Deneme - B", { ...own11, m11_fen: full(25, 5, 10) });
    const partial = exam("11. SINIF Genel Deneme - C", { m11_sosyal1: full(20, 8, 12) }, "2026-10-20");
    const chart = maarif11NetChart([complete, partial] as never);
    expect(chart).toHaveLength(1);
    expect(chart[0].value).toBeCloseTo(computeNet(75, 17), 5);
  });
});

describe("guards", () => {
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const walk = (dir: string, out: string[]) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
    }
    return out;
  };

  it("no screen or helper carries its own copy of the title -> track regexes any more: lib/general-exam-track.ts is the one place", () => {
    const files = [...walk(join(root, "app"), []), ...walk(join(root, "components"), []), ...walk(join(root, "lib"), [])];
    const offenders = files.filter((f) => {
      const norm = f.split("\\").join("/");
      if (norm.endsWith("lib/general-exam-track.ts")) return false;
      // a regex literal over a grade title: /^9\.\s*SINIF\b/ and friends
      return /\/\^[^/\n]*SINIF[^/\n]*\//.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("migration 0137 renames only TYT-shaped '11. SINIF' rows, backs them up first, and verifies the totals", () => {
    const sql = readFileSync(new URL("../supabase/migrations/0137_maarif_tyt_general_exam_titles.sql", import.meta.url), "utf8");
    expect(sql).toContain("migration_backups.m0137_student_tasks");
    expect(sql).toContain("task_type = 'general_exam'");
    expect(sql).toContain("array['turkce', 'sosyal', 'matematik', 'fen']");
    expect(sql).toContain("array['m11_sosyal1', 'm11_matematik', 'm11_fen', 'm11_sosyal2']");
    expect(sql).toContain("like 'maarif11-%'");
    expect(sql).toContain("'Maarif TYT'");
    expect(sql).toContain("question totals changed");
    expect(sql).toContain("-- ROLLBACK");
    // never touches anything but the title
    expect(sql).not.toMatch(/set\s+(course_id|topic_id|subject_scores|status)/i);
  });
});
