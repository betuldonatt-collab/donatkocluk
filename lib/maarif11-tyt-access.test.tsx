import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { cardBackgroundClass } from "@/app/coach/students/[id]/_components/kanban/task-card-body";
import { courseOptionsFor, firstCourseIdFor } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { TopicGroupSelect } from "@/components/topic-group-select";
import { courseDisplayName, findCourseById, topicOptionsForCourse } from "./curriculum";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { subjectTintClass } from "@/app/student/_components/daily-tasks/types";
import { MAARIF11_KAYNAK_COURSES, MAARIF11_COURSES } from "./curriculum/maarif11";
import { maarifSelectionNodes } from "./curriculum/maarif-selection";
import kaynakJson from "./curriculum/maarif11.json";
import { withCleanNames } from "./curriculum/topic-name";
import { groupOfTopic, mainTopicOptions, topicGroups, unitMasterId } from "./curriculum/topic-groups";
import { maarif11AssignableCourses, maarif11CourseOptions } from "./maarif-grade";
import { subjectBackgroundClass } from "./subject-colors";
import type { DetailTask } from "@/app/coach/students/[id]/types";

describe("an 11th grader's Ders list: own courses AND the Maarif TYT courses, kept apart", () => {
  it("lists both versions of a subject as separate items with their own prefix", () => {
    const options = courseOptionsFor("YKS", false, 11);
    const label = (id: string) => options.find((o) => o.id === id)?.label;
    expect(label("maarif11-matematik")).toBe("11. Sınıf Matematik");
    expect(label("maarif-tyt-matematik")).toBe("Maarif TYT Matematik");
    expect(label("maarif11-fizik")).toBe("11. Sınıf Fizik");
    expect(label("maarif-tyt-fizik")).toBe("Maarif TYT Fizik");
    expect(new Set(options.map((o) => o.label)).size).toBe(options.length);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
  });

  it("has all eight own courses and every Maarif TYT course, under two headings, own courses first", () => {
    const options = maarif11CourseOptions();
    expect(options.filter((o) => o.group === "11. Sınıf").map((o) => o.id)).toEqual(MAARIF11_KAYNAK_COURSES.map((c) => c.id));
    expect(options.filter((o) => o.group === "Maarif TYT").map((o) => o.id)).toEqual(MAARIF_TYT_MERGED_COURSES.map((c) => c.id));
    const firstTyt = options.findIndex((o) => o.group === "Maarif TYT");
    expect(options.slice(0, firstTyt).every((o) => o.group === "11. Sınıf")).toBe(true);
    expect(options.slice(firstTyt).every((o) => o.group === "Maarif TYT")).toBe(true);
  });

  it("never offers the standard TYT / AYT courses to an 11th grader, not even for a Branş Denemesi", () => {
    for (const branch of [false, true]) {
      const ids = courseOptionsFor("YKS", branch, 11).map((o) => o.id);
      expect(ids.some((id) => id.startsWith("tyt-") || id.startsWith("ayt-")), String(branch)).toBe(false);
    }
  });

  it("every offered course resolves to a real course with topics (so a task can be saved against it)", () => {
    for (const o of maarif11CourseOptions()) expect(findCourseById(o.id), o.id).not.toBeNull();
    expect(maarif11AssignableCourses().map((c) => c.id)).toEqual(maarif11CourseOptions().map((o) => o.id));
  });

  it("a Maarif TYT course is named so on cards and titles, never as a bare subject", () => {
    expect(courseDisplayName("maarif-tyt-matematik", "Matematik")).toBe("Maarif TYT Matematik");
    expect(courseDisplayName("maarif-tyt-din-kulturu", "Din Kültürü ve Ahlak Bilgisi")).toBe("Maarif TYT Din Kültürü ve Ahlak Bilgisi");
    expect(courseDisplayName("maarif-tyt-matematik", "Maarif TYT Matematik")).toBe("Maarif TYT Matematik");
    expect(courseDisplayName("maarif11-matematik", "11. Sınıf Matematik")).toBe("11. Sınıf Matematik");
  });

  it("opens on the grade's own first course; the other Maarif grades still get only their own courses", () => {
    expect(firstCourseIdFor("YKS", 11)).toBe("maarif11-matematik");
    for (const grade of [7, 9, 10] as const) {
      const options = courseOptionsFor("YKS", false, grade);
      expect(options.some((o) => o.id.startsWith("tyt-")), String(grade)).toBe(false);
      expect(options.length).toBeGreaterThan(0);
    }
    // an ordinary YKS student is unchanged: TYT and AYT, no Maarif courses
    const yks = courseOptionsFor("YKS", false, null);
    expect(yks.some((o) => o.id.startsWith("maarif"))).toBe(false);
    expect(yks.some((o) => o.id === "tyt-matematik")).toBe(true);
  });
});

describe("the 11th grade's two-level topic structure (Ünite -> Alt Başlık)", () => {
  const native = withCleanNames(kaynakJson as { id: string; units: { unit: string; topics: { id: string; name: string }[] }[] }[]);

  it("every unit with two or more topics has its master, last in the unit, named without the unit number", () => {
    for (const course of MAARIF11_COURSES) {
      course.units.forEach((unit, ui) => {
        const nativeUnit = native.find((c) => c.id === course.id)!.units[ui];
        if (nativeUnit.topics.length < 2) {
          expect(unit.topics).toEqual(nativeUnit.topics); // a single-topic unit has nothing to group
          return;
        }
        const master = unit.topics[unit.topics.length - 1];
        expect(master.id).toBe(unitMasterId(course.id, ui));
        expect(master.name.endsWith(" (Genel)")).toBe(true);
        expect(master.name).not.toMatch(/^\d/);
        // the unit's own topics are untouched: same ids, same names, same order
        expect(unit.topics.slice(0, -1)).toEqual(nativeUnit.topics);
      });
    }
  });

  it("groups every such unit: the master plus the native topics as its subtopics", () => {
    for (const course of MAARIF11_COURSES) {
      const groups = topicGroups(course);
      const expected = course.units.filter((u) => u.topics.length >= 2 + 0 && u.topics.some((t) => t.id.includes("-genel-u"))).length;
      expect(groups).toHaveLength(expected);
      for (const g of groups) {
        const unit = course.units.find((u) => u.unit === g.unitLabel)!;
        expect(g.members.map((t) => t.id)).toEqual(unit.topics.filter((t) => t.id !== g.masterId).map((t) => t.id));
      }
    }
    const fizik = findCourseById("maarif11-fizik")!;
    expect(topicGroups(fizik)).toHaveLength(3);
    expect(topicGroups(fizik)[0].members).toHaveLength(10);
    // Coğrafya's two single-topic units stay flat
    expect(topicGroups(findCourseById("maarif11-cografya")!)).toHaveLength(5);
  });

  it("the main Konu list shows the Ünite masters, the subtopics sit behind the secondary picker", () => {
    const fizik = findCourseById("maarif11-fizik")!;
    const main = mainTopicOptions(fizik, topicOptionsForCourse(fizik)).map((o) => o.label);
    expect(main).toEqual(["Kuvvet ve Hareket (Genel)", "Elektrik ve Manyetizma (Genel)", "Optik (Genel)", "Karma"].map((l) => expect.stringContaining(l.replace(" (Genel)", ""))));
    expect(main.filter((l) => l.endsWith("(Genel)"))).toHaveLength(3);
    const subtopic = fizik.units[0].topics[2];
    expect(main).not.toContain(subtopic.name);
    expect(groupOfTopic(fizik, subtopic.id)?.masterId).toBe(unitMasterId("maarif11-fizik", 0));

    // choosing the master (or one of its subtopics) opens the optional Başlık step (these topics sit under headings, so
    // there is a third, "Alt başlık" step once a heading is chosen -- see lib/topic-three-step.test.tsx)
    const html = (topicId: string) => renderToStaticMarkup(<TopicGroupSelect course={fizik} topicId={topicId} onChange={() => {}} />);
    expect(html(unitMasterId("maarif11-fizik", 0))).toContain("Başlık (opsiyonel)");
    expect(html(fizik.units[0].topics[0].id)).toContain("Alt başlık (opsiyonel)"); // "Serbest Düşme › ..." sits under a heading
    expect(html(subtopic.id)).not.toContain("Alt başlık (opsiyonel)"); // "İki Boyutta Sabit İvmeli Hareket" has none
    expect(html("")).toBe("");
  });

  it("no existing Kaynak Takibi row changes its id: ticks saved against a row keep showing", () => {
    for (const course of MAARIF11_COURSES) {
      const before = maarifSelectionNodes(native.find((c) => c.id === course.id)! as never).map((n) => n.id);
      const after = new Set(maarifSelectionNodes(course).map((n) => n.id));
      for (const id of before) expect(after.has(id), `${course.id} ${id}`).toBe(true);
    }
  });

  it("the 9th / 10th grade carry their OWN masters (maarif9-... / maarif10-... ids), never the 11th grade's", () => {
    const ids = (id: string) => findCourseById(id)!.units.flatMap((u) => u.topics.map((t) => t.id)).filter((x) => x.includes("-genel-u"));
    expect(ids("maarif10-fizik").every((x) => x.startsWith("maarif10-fizik-genel-u"))).toBe(true);
    expect(ids("maarif9-matematik").every((x) => x.startsWith("maarif9-matematik-genel-u"))).toBe(true);
    expect(ids("maarif10-fizik").length).toBeGreaterThan(0);
  });
});

describe("colour: 11. Sınıf deeper, Maarif TYT lighter (coach cards and the student's own cards)", () => {
  const deep = { deepMaarif11: true };
  it("an 11th-grade course takes the deeper (AYT) tier, a Maarif TYT course the lighter one", () => {
    expect(subjectBackgroundClass("maarif11-matematik", "question_bank", deep)).toBe("bg-[var(--subject-matematik)]/12");
    expect(subjectBackgroundClass("maarif-tyt-matematik", "question_bank", deep)).toBe("bg-[var(--subject-matematik)]/6");
    expect(subjectBackgroundClass("ayt-matematik-sayisal", "question_bank", deep)).toBe(subjectBackgroundClass("maarif11-matematik", "question_bank", deep));
    // same subject hue, so the pair still reads as one subject in two weights
    for (const [m11, tyt] of [
      ["maarif11-fizik", "maarif-tyt-fizik"],
      ["maarif11-tarih", "maarif-tyt-tarih"],
      ["maarif11-turk-dili-ve-edebiyati", "maarif-tyt-turk-dili-ve-edebiyati"],
    ]) {
      const a = subjectBackgroundClass(m11, "question_bank", deep);
      const b = subjectBackgroundClass(tyt, "question_bank", deep);
      expect(a).not.toBe(b);
      expect(a.replace("/12", "")).toBe(b.replace("/6", ""));
    }
  });

  it("every merged Maarif TYT course has its subject's own hue (never the neutral grey), in the lighter tier", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const cls = subjectBackgroundClass(c.id, "question_bank", deep);
      expect(cls, c.id).not.toBe("bg-slate-500/10");
      expect(cls, c.id).toMatch(/\/6$/);
    }
  });

  it("is opt-in and limited to the 11th grade: every other caller and grade keeps its tier", () => {
    expect(subjectBackgroundClass("maarif11-matematik", "question_bank")).toBe(subjectBackgroundClass("tyt-matematik", "question_bank"));
    expect(subjectBackgroundClass("maarif10-matematik", "question_bank", deep)).toBe(subjectBackgroundClass("tyt-matematik", "question_bank"));
    expect(subjectBackgroundClass("maarif9-fizik", "question_bank", deep)).toBe(subjectBackgroundClass("tyt-fizik", "question_bank"));
    // a Branş Denemesi stays the deepest tier for both
    expect(subjectBackgroundClass("maarif11-matematik", "branch_exam", deep)).toBe(subjectBackgroundClass("tyt-matematik", "branch_exam", deep));
    expect(subjectBackgroundClass(null, "general_exam", deep)).toBe(subjectBackgroundClass(null, "general_exam"));
  });

  it("the coach's task cards and the student's own cards both use it", () => {
    const task = (course_id: string) => ({ course_id, task_type: "question_bank" }) as DetailTask;
    expect(cardBackgroundClass(task("maarif11-fizik"))).toBe("bg-[var(--subject-fizik)]/12");
    expect(cardBackgroundClass(task("maarif-tyt-fizik"))).toBe("bg-[var(--subject-fizik)]/6");
    expect(subjectTintClass({ course_id: "maarif11-fizik", task_type: "question_bank" })).toBe("bg-[var(--subject-fizik)]/12");
    expect(subjectTintClass({ course_id: "maarif-tyt-fizik", task_type: "question_bank" })).toBe("bg-[var(--subject-fizik)]/6");
    // a student of any other cohort sees what they always saw
    expect(subjectTintClass({ course_id: "tyt-fizik", task_type: "question_bank" })).toBe("bg-[var(--subject-fizik)]/6");
    expect(subjectTintClass({ course_id: "maarif10-fizik", task_type: "question_bank" })).toBe("bg-[var(--subject-fizik)]/6");
  });
});
