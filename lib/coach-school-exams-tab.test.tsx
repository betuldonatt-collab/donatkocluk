import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The tab imports server actions; the rendering tests below never call them.
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("@/app/student/yazililar/actions", () => ({
  addCustomSchoolCourse: vi.fn(),
  cancelSchoolCourseRemoval: vi.fn(),
  deleteCustomSchoolCourse: vi.fn(),
  renameCustomSchoolCourse: vi.fn(),
  requestSchoolCourseRemoval: vi.fn(),
  saveSchoolGrade: vi.fn(),
  setSchoolCourseColor: vi.fn(),
}));

import { SchoolExamsTab } from "@/app/coach/students/[id]/_components/school-exams-tab";
import type { SchoolExamsData } from "@/lib/school-exams-data";
import { YazililarClient } from "@/app/student/yazililar/yazililar-client";
import { buildSchoolCards, DEFAULT_SCHOOL_COURSES, type StoredSchoolCourse } from "./school-exams";

const course = (over: Partial<StoredSchoolCourse> & Pick<StoredSchoolCourse, "id" | "key" | "name">): StoredSchoolCourse => ({
  isCustom: false,
  color: null,
  removalStatus: "none",
  removed: false,
  ...over,
});

const base = (over: Partial<SchoolExamsData> = {}): SchoolExamsData => ({
  cohort: "grade7",
  defaults: DEFAULT_SCHOOL_COURSES.grade7,
  courses: [],
  grades: [],
  ready: true,
  ...over,
});

const ids = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("buildSchoolCards (the coach's read model)", () => {
  it("has a card for every default course of the grade, even ones the student never touched", () => {
    const cards = buildSchoolCards(DEFAULT_SCHOOL_COURSES.grade7, [], []);
    expect(cards.map((c) => c.name)).toEqual(["Matematik", "Türkçe", "Fen Bilimleri", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi"]);
    expect(cards.every((c) => Object.keys(c.grades).length === 0 && c.courseId === null)).toBe(true);
  });

  it("attaches each saved grade to its course/term/yazılı, with its lock, in the colour the student picked", () => {
    const cards = buildSchoolCards(
      DEFAULT_SCHOOL_COURSES.grade7,
      [course({ id: "c1", key: "matematik", name: "Matematik", color: "mavi" })],
      [
        { courseId: "c1", term: 1, examNo: 1, grade: 85.5, locked: true },
        { courseId: "c1", term: 2, examNo: 2, grade: 100 },
        { courseId: "other", term: 1, examNo: 2, grade: 10, locked: true },
      ],
    );
    expect(cards[0].color).toBe("mavi");
    expect(cards[0].courseId).toBe("c1");
    expect(cards[0].grades).toEqual({ "1-1": 85.5, "2-2": 100 });
    expect(cards[0].locks).toEqual({ "1-1": true });
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
  const withGrades = base({
    courses: [course({ id: "c1", key: "matematik", name: "Matematik" })],
    grades: [
      { courseId: "c1", term: 1, examNo: 1, grade: 85.5, locked: true },
      { courseId: "c1", term: 1, examNo: 2, grade: 90 },
    ],
  });
  const render = (data: SchoolExamsData) => renderToStaticMarkup(<SchoolExamsTab data={data} studentId="s1" />);

  it("shows an editable box for every yazılı of every course (6 courses x 4)", () => {
    const html = render(withGrades);
    expect(html).toContain("7. Sınıf yazılı notları");
    expect(html).toContain("1. Dönem");
    expect(html).toContain("II. Yazılı");
    expect(ids(html, /<input /g)).toBe(24);
    expect(html).toContain('value="85,5"');
    expect(html).toContain('value="90"');
    expect(html).not.toContain("Henüz not girilmemiş");
    for (const name of ["Matematik", "Türkçe", "Fen Bilimleri", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi"]) expect(html).toContain(name);
  });

  it("offers a lock only on a grade that exists, showing the locked one as locked", () => {
    const html = render(withGrades);
    // two saved grades -> two lock buttons; the locked one reads as pressed and offers to unlock
    expect(ids(html, /aria-pressed=/g)).toBe(2);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Matematik 1. Dönem I. Yazılı notunun kilidini aç");
    expect(html).toContain("Matematik 1. Dönem II. Yazılı notunu kilitle");
  });

  it("says so when no grade has been entered at all, and has no lock buttons", () => {
    const html = render(base());
    expect(html).toContain("Henüz not girilmemiş");
    expect(ids(html, /aria-pressed=/g)).toBe(0);
  });

  it("lets the coach decide a pending course-removal request on the course's own card", () => {
    const html = render(base({ courses: [course({ id: "c1", key: "din", name: "Din", removalStatus: "pending" })] }));
    expect(html).toContain("Öğrenci bu dersi almadığını bildirdi.");
    expect(html).toContain(">Onayla<");
    expect(html).toContain(">Reddet<");
    expect(html).not.toContain("Ders Silme Talepleri");
  });

  it("shows no decision buttons when nothing is pending", () => {
    const html = render(base({ courses: [course({ id: "c1", key: "din", name: "Din" })] }));
    expect(html).not.toContain(">Reddet<");
  });

  it("falls back to a calm message when the tables cannot be read", () => {
    const html = render(base({ ready: false }));
    expect(html).toContain("şu anda gösterilemiyor");
    expect(html).not.toContain("Matematik");
  });
});

describe("the student's Yazılılar: a coach-locked grade is read-only", () => {
  const defaults = DEFAULT_SCHOOL_COURSES.grade7;
  const html = renderToStaticMarkup(
    <YazililarClient
      defaults={defaults}
      courses={[{ id: "c1", key: "matematik", isCustom: false, name: "Matematik", color: null, removalStatus: "none", removed: false }]}
      grades={[
        { courseId: "c1", term: 1, examNo: 1, grade: 85.5, locked: true },
        { courseId: "c1", term: 1, examNo: 2, grade: 90 },
      ]}
      readOnly={false}
    />,
  );

  it("renders the locked grade as a locked, non-input cell and every other grade as an editable box", () => {
    // 6 courses x 4 boxes = 24, minus the one locked grade
    expect(ids(html, /<input type="text"/g)).toBe(23);
    expect(html).toContain("koçun kilitledi");
    expect(html).toContain("85,5");
    expect(html).toContain('value="90"');
    expect(html).not.toContain('value="85,5"');
  });
});
