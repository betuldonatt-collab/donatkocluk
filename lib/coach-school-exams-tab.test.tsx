import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SchoolExamsTab } from "@/app/coach/students/[id]/_components/school-exams-tab";
import type { CoachSchoolExams } from "@/app/coach/students/[id]/school-exams-data";
import { buildSchoolCards, DEFAULT_SCHOOL_COURSES, type StoredSchoolCourse } from "./school-exams";

const course = (over: Partial<StoredSchoolCourse> & Pick<StoredSchoolCourse, "id" | "key" | "name">): StoredSchoolCourse => ({
  isCustom: false,
  color: null,
  removalStatus: "none",
  removed: false,
  ...over,
});

const base = (over: Partial<CoachSchoolExams> = {}): CoachSchoolExams => ({
  cohort: "grade7",
  defaults: DEFAULT_SCHOOL_COURSES.grade7,
  courses: [],
  grades: [],
  ready: true,
  ...over,
});

describe("buildSchoolCards (the coach's read model)", () => {
  it("has a card for every default course of the grade, even ones the student never touched", () => {
    const cards = buildSchoolCards(DEFAULT_SCHOOL_COURSES.grade7, [], []);
    expect(cards.map((c) => c.name)).toEqual(["Matematik", "Türkçe", "Fen Bilimleri", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi"]);
    expect(cards.every((c) => Object.keys(c.grades).length === 0)).toBe(true);
  });

  it("attaches each saved grade to its course/term/yazılı, in the colour the student picked", () => {
    const cards = buildSchoolCards(
      DEFAULT_SCHOOL_COURSES.grade7,
      [course({ id: "c1", key: "matematik", name: "Matematik", color: "mavi" })],
      [
        { courseId: "c1", term: 1, examNo: 1, grade: 85.5 },
        { courseId: "c1", term: 2, examNo: 2, grade: 100 },
        { courseId: "other", term: 1, examNo: 2, grade: 10 },
      ],
    );
    expect(cards[0].color).toBe("mavi");
    expect(cards[0].grades).toEqual({ "1-1": 85.5, "2-2": 100 });
  });

  it("leaves out a course the coach approved dropping, and lists the student's own courses after the defaults", () => {
    const cards = buildSchoolCards(
      DEFAULT_SCHOOL_COURSES.grade7,
      [
        course({ id: "c1", key: "fen", name: "Fen Bilimleri", removed: true }),
        course({ id: "c2", key: "custom-1", name: "Satranç", isCustom: true }),
        course({ id: "c3", key: "custom-2", name: "Silinmiş", isCustom: true, removed: true }),
      ],
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(["Matematik", "Türkçe", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi", "Satranç"]);
  });

  it("carries a pending removal request through", () => {
    const cards = buildSchoolCards(DEFAULT_SCHOOL_COURSES.grade7, [course({ id: "c1", key: "din", name: "x", removalStatus: "pending" })], []);
    expect(cards.find((c) => c.key === "din")?.removalStatus).toBe("pending");
  });
});

describe("the coach's Yazılılar tab", () => {
  it("shows the grades read-only, with an em dash where nothing is entered", () => {
    const html = renderToStaticMarkup(
      <SchoolExamsTab
        data={base({
          courses: [course({ id: "c1", key: "matematik", name: "Matematik" })],
          grades: [
            { courseId: "c1", term: 1, examNo: 1, grade: 85.5 },
            { courseId: "c1", term: 1, examNo: 2, grade: 90 },
          ],
        })}
      />,
    );
    expect(html).toContain("7. Sınıf yazılı notları");
    expect(html).toContain("85,5");
    expect(html).toContain("90");
    expect(html).toContain("1. Dönem");
    expect(html).toContain("II. Yazılı");
    expect(html).toContain("—");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Henüz not girilmemiş");
    for (const name of ["Matematik", "Türkçe", "Fen Bilimleri", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi"]) expect(html).toContain(name);
  });

  it("says so when the student has entered no grade at all", () => {
    expect(renderToStaticMarkup(<SchoolExamsTab data={base()} />)).toContain("Henüz not girilmemiş");
  });

  it("flags a pending course-removal request for the coach", () => {
    const html = renderToStaticMarkup(<SchoolExamsTab data={base({ courses: [course({ id: "c1", key: "din", name: "Din", removalStatus: "pending" })] })} />);
    expect(html).toContain("Ders Silme Talepleri");
  });

  it("falls back to a calm message when the tables cannot be read", () => {
    const html = renderToStaticMarkup(<SchoolExamsTab data={base({ ready: false })} />);
    expect(html).toContain("şu anda gösterilemiyor");
    expect(html).not.toContain("Matematik");
  });
});
