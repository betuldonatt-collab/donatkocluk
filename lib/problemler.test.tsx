import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/kaynak-takibi/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { EditableCourseTable } from "@/app/coach/students/[id]/_components/editable-course-table";
import { defaultTaskFormValue, TaskFormFields } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { CourseTable } from "@/app/student/kaynak-takibi/_components/course-table";
import { ProblemlerSubtopicSelect } from "@/components/problemler-subtopic-select";
import { findCourseById, findTopicById, topicOptionsForCourse } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";
import {
  bridgeProblemRoutine,
  mainTopicOptions,
  PROBLEMLER_COURSE_ID,
  PROBLEMLER_MASTER_ID,
  problemlerMainValue,
  problemlerParentLayout,
  problemlerSubtopics,
  problemlerTopicIds,
  sumTopicStats,
  type Stat,
} from "./curriculum/problemler";

const course = findCourseById(PROBLEMLER_COURSE_ID)!;
const stat = (total: number, correct: number, wrong: number, empty: number): Stat => ({ total, correct, wrong, empty });
const SUB = problemlerSubtopics(course);

describe("TYT Matematik's Problemler: the master topic and the subtopics", () => {
  it("has a general 'Problemler (Genel)' topic first in the Problemler unit, with all eight specific subtopics intact", () => {
    const unit = course.units.find((u) => u.unit === "Problemler")!;
    expect(unit.topics[0]).toMatchObject({ id: PROBLEMLER_MASTER_ID, name: "Problemler (Genel)" });
    expect(SUB.map((t) => t.name)).toEqual([
      "Sayı-Kesir Problemleri",
      "Yaş Problemleri",
      "İşçi Problemleri",
      "Hız Problemleri",
      "Karışım Problemleri",
      "Yüzde-Kâr-Zarar Problemleri",
      "Grafik Problemleri",
      "Rutin Olmayan Problemler",
    ]);
    expect(SUB.map((t) => t.id)).toEqual(Array.from({ length: 8 }, (_, i) => `tyt-matematik-u1-t${i}`)); // ids unchanged
    expect(problemlerTopicIds(course)).toHaveLength(9);
  });

  it("resolves by id like any topic (task titles read 'TYT Matematik — Problemler (Genel)')", () => {
    expect(findTopicById(PROBLEMLER_COURSE_ID, PROBLEMLER_MASTER_ID)?.name).toBe("Problemler (Genel)");
    expect(topicOptionsForCourse(course).map((o) => o.id)).toContain(PROBLEMLER_MASTER_ID);
  });

  it("leaves every other topic id of the course alone", () => {
    const ids = course.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("tyt-matematik-u0-t0");
    expect(ids).toContain("tyt-matematik-u2-t6");
    expect(ids).toHaveLength(12 + 9 + 7);
  });
});

describe("hierarchical selection (the coach's task form)", () => {
  const options = topicOptionsForCourse(course);

  it("lists 'Problemler (Genel)' in the main Konu list but not the eight subtopics on their own", () => {
    const main = mainTopicOptions(course, options).map((o) => o.id);
    expect(main).toContain(PROBLEMLER_MASTER_ID);
    for (const t of SUB) expect(main).not.toContain(t.id);
    expect(main).toContain("tyt-matematik-u0-t0");
    expect(main).toContain("karma");
  });

  it("shows a stored subtopic as its parent in the main picker (the secondary picker shows the subtopic)", () => {
    expect(problemlerMainValue(course, SUB[1].id)).toBe(PROBLEMLER_MASTER_ID);
    expect(problemlerMainValue(course, PROBLEMLER_MASTER_ID)).toBe(PROBLEMLER_MASTER_ID);
    expect(problemlerMainValue(course, "tyt-matematik-u0-t0")).toBe("tyt-matematik-u0-t0");
    expect(problemlerMainValue(course, "")).toBe("");
  });

  it("changes nothing for any other course", () => {
    const fizik = findCourseById("tyt-fizik")!;
    const o = topicOptionsForCourse(fizik);
    expect(mainTopicOptions(fizik, o)).toEqual(o);
    expect(problemlerMainValue(fizik, "x")).toBe("x");
    expect(problemlerSubtopics(fizik)).toEqual([]);
  });

  const formHtml = (topicId: string) =>
    renderToStaticMarkup(
      <TaskFormFields value={{ ...defaultTaskFormValue("YKS"), courseId: PROBLEMLER_COURSE_ID, topicId }} onChange={() => {}} />,
    );

  it("the form offers the secondary 'Problem türü (opsiyonel)' picker once Problemler is the topic, with the eight subtopics", () => {
    for (const topicId of [PROBLEMLER_MASTER_ID, SUB[3].id]) {
      const html = formHtml(topicId);
      expect(html).toContain("Problem türü (opsiyonel)");
      expect(html).toContain("Genel (tüm problemler)");
      for (const t of SUB) expect(html).toContain(t.name);
    }
    // a stored subtopic is preselected in the secondary picker
    expect(formHtml(SUB[3].id)).toMatch(/<option value="tyt-matematik-u1-t3" selected/);
    // general = nothing picked in the secondary one
    expect(formHtml(PROBLEMLER_MASTER_ID)).toMatch(/<option value="" selected/);
  });

  it("does not show it for another topic or another course", () => {
    expect(formHtml("tyt-matematik-u0-t0")).not.toContain("Problem türü");
    const other = renderToStaticMarkup(<TaskFormFields value={{ ...defaultTaskFormValue("YKS"), courseId: "tyt-fizik", topicId: "" }} onChange={() => {}} />);
    expect(other).not.toContain("Problem türü");
  });
});

describe("bridging the standalone Problem routine into TYT Matematik", () => {
  type Entry = { topicStats: { byTopic: Record<string, Stat>; karma: Stat } };
  const entry = (karma = stat(0, 0, 0, 0), byTopic: Record<string, Stat> = {}): Entry => ({ topicStats: { byTopic, karma } });

  it("moves the routine's results onto the master topic and empties the routine's bucket (counted once)", () => {
    const data: Record<string, Entry> = { problem: entry(stat(60, 40, 15, 5)), [PROBLEMLER_COURSE_ID]: entry() };
    bridgeProblemRoutine(data, (id) => (data[id] ??= entry()));
    expect(data[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(60, 40, 15, 5));
    expect(data.problem.topicStats.karma).toEqual(stat(0, 0, 0, 0));
    // the grand total across all courses is unchanged
    const all = Object.values(data).flatMap((e) => [e.topicStats.karma, ...Object.values(e.topicStats.byTopic)]);
    expect(all.reduce((n, s) => n + s.total, 0)).toBe(60);
  });

  it("adds to what tasks assigned straight to 'Problemler (Genel)' already logged, and creates TYT Matematik's entry if needed", () => {
    const data: Record<string, Entry> = {
      problem: entry(stat(10, 7, 2, 1)),
      [PROBLEMLER_COURSE_ID]: entry(stat(0, 0, 0, 0), { [PROBLEMLER_MASTER_ID]: stat(30, 20, 5, 5) }),
    };
    bridgeProblemRoutine(data, (id) => (data[id] ??= entry()));
    expect(data[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(40, 27, 7, 6));

    const fresh: Record<string, Entry> = { problem: entry(stat(5, 5, 0, 0)) };
    bridgeProblemRoutine(fresh, (id) => (fresh[id] ??= entry()));
    expect(fresh[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(5, 5, 0, 0));
  });

  it("does nothing without routine results, or for a student whose Kaynak Takibi has no TYT courses", () => {
    const none: Record<string, Entry> = { [PROBLEMLER_COURSE_ID]: entry() };
    bridgeProblemRoutine(none, (id) => (none[id] ??= entry()));
    expect(none[PROBLEMLER_COURSE_ID].topicStats.byTopic).toEqual({});

    const disabled: Record<string, Entry> = { problem: entry(stat(9, 9, 0, 0)) };
    bridgeProblemRoutine(disabled, (id) => (disabled[id] ??= entry()), false);
    expect(disabled.problem.topicStats.karma).toEqual(stat(9, 9, 0, 0));
    expect(disabled[PROBLEMLER_COURSE_ID]).toBeUndefined();
  });

  it("the section total is the master + every subtopic (what the parent row shows)", () => {
    const byTopic = { [PROBLEMLER_MASTER_ID]: stat(40, 27, 7, 6), [SUB[0].id]: stat(20, 15, 4, 1), [SUB[1].id]: stat(10, 6, 3, 1), "tyt-matematik-u0-t0": stat(99, 99, 0, 0) };
    expect(sumTopicStats(byTopic, problemlerTopicIds(course))).toEqual(stat(70, 48, 14, 8));
  });
});

describe("the Kaynak Takibi parent row 'Problemler' with cumulative stats", () => {
  const byTopic = { [PROBLEMLER_MASTER_ID]: stat(40, 27, 7, 6), [SUB[0].id]: stat(20, 15, 4, 1), [SUB[1].id]: stat(10, 6, 3, 1) };
  const topicStats = { byTopic, karma: stat(0, 0, 0, 0) };
  const resources = [{ id: "r1", name: "Kaynak A" }];

  it("sits above the unit's rows and takes over the unit cell (one row taller)", () => {
    const rows = flattenSelectionRows(course);
    const { parentBefore, unitSpan } = problemlerParentLayout(course, rows);
    expect([...parentBefore.keys()]).toEqual([PROBLEMLER_MASTER_ID]);
    expect(parentBefore.get(PROBLEMLER_MASTER_ID)).toMatchObject({ unitRowSpan: 10, unitLabel: "Problemler" });
    // the first row gives its unit cell up; the others never had one
    expect(unitSpan(rows.find((r) => r.id === PROBLEMLER_MASTER_ID)!)).toBeNull();
    expect(unitSpan(rows.find((r) => r.id === SUB[0].id)!)).toBeNull();
    // other units are untouched
    expect(unitSpan(rows.find((r) => r.id === "tyt-matematik-u0-t0")!)).toBe(1);
  });

  it("is not added to any other course", () => {
    const fizik = findCourseById("tyt-fizik")!;
    expect(problemlerParentLayout(fizik, flattenSelectionRows(fizik)).parentBefore.size).toBe(0);
  });

  const studentHtml = renderToStaticMarkup(
    <CourseTable course={course} resources={resources} progress={{}} topicStats={topicStats} onAddResource={async () => {}} onToggle={() => {}} />,
  );

  it("the student's table shows the cumulative Toplam / D / Y / B (70 / 48 / 14 / 8) on the parent row, once", () => {
    expect(studentHtml.match(/data-problemler-parent/g)).toHaveLength(1);
    const parent = studentHtml.slice(studentHtml.indexOf("data-problemler-parent"));
    const row = parent.slice(0, parent.indexOf("</tr>"));
    expect(row).toContain(">70<");
    expect(row).toContain(">48<");
    expect(row).toContain(">14<");
    expect(row).toContain(">8<");
    expect(row).toContain('rowSpan="10"');
  });

  it("keeps every subtopic row with its own figures, plus the master row 'Problemler (Genel)'", () => {
    for (const t of SUB) expect(studentHtml).toContain(t.name);
    expect(studentHtml).toContain("Problemler (Genel)");
    // the Yaş Problemleri row shows its own 10 / 6 / 3 / 1
    const yas = studentHtml.slice(studentHtml.indexOf("Yaş Problemleri") - 800, studentHtml.indexOf("Yaş Problemleri"));
    expect(yas).toContain(">10<");
  });

  it("only one unit cell for the whole section (the parent row's)", () => {
    // the vertical 'Problemler' label appears once as the unit cell
    expect(studentHtml.match(/\[writing-mode:vertical-rl\][^>]*>Problemler</g)).toHaveLength(1);
  });

  it("the coach's table shows the same parent row", () => {
    const html = renderToStaticMarkup(
      <EditableCourseTable
        course={course}
        resources={[{ id: "r1", name: "Kaynak A", is_active: true }]}
        progress={{}}
        topicStats={topicStats}
        onAddResource={() => {}}
        onToggle={() => {}}
        onArchiveResource={() => {}}
        onReactivateResource={() => {}}
        onDeleteResource={async () => {}}
      />,
    );
    expect(html.match(/data-problemler-parent/g)).toHaveLength(1);
    const parent = html.slice(html.indexOf("data-problemler-parent"));
    expect(parent.slice(0, parent.indexOf("</tr>"))).toContain(">70<");
  });

  it("other courses' tables have no parent row", () => {
    const fizik = findCourseById("tyt-fizik")!;
    const html = renderToStaticMarkup(
      <CourseTable course={fizik} resources={[]} progress={{}} topicStats={{ byTopic: {}, karma: stat(0, 0, 0, 0) }} onAddResource={async () => {}} onToggle={() => {}} />,
    );
    expect(html).not.toContain("data-problemler-parent");
  });
});

describe("the shared second step (coach form and student 'Ek Çalışma Ekle')", () => {
  const html = (courseId: string, topicId: string) =>
    renderToStaticMarkup(<ProblemlerSubtopicSelect course={findCourseById(courseId)!} topicId={topicId} onChange={() => {}} />);

  it("renders the optional picker for Problemler (general or a subtopic) with the eight subtopics", () => {
    for (const topicId of [PROBLEMLER_MASTER_ID, SUB[5].id]) {
      const out = html(PROBLEMLER_COURSE_ID, topicId);
      expect(out).toContain("Problem türü (opsiyonel)");
      expect(out).toContain("Genel (tüm problemler)");
      for (const t of SUB) expect(out).toContain(t.name);
    }
    expect(html(PROBLEMLER_COURSE_ID, SUB[5].id)).toMatch(/<option value="tyt-matematik-u1-t5" selected/);
    expect(html(PROBLEMLER_COURSE_ID, PROBLEMLER_MASTER_ID)).toMatch(/<option value="" selected/);
  });

  it("renders nothing for another topic or another course", () => {
    expect(html(PROBLEMLER_COURSE_ID, "tyt-matematik-u0-t0")).toBe("");
    expect(html(PROBLEMLER_COURSE_ID, "")).toBe("");
    expect(html("tyt-fizik", PROBLEMLER_MASTER_ID)).toBe("");
  });
});
