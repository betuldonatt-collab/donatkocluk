import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ParentSchoolExams } from "@/app/parent/_components/parent-school-exams";
import type { SchoolExamsData } from "./school-exams-data";
import { DEFAULT_SCHOOL_COURSES } from "./school-exams";

const data = (over: Partial<SchoolExamsData> = {}): SchoolExamsData => ({
  cohort: "grade7",
  defaults: DEFAULT_SCHOOL_COURSES.grade7,
  courses: [{ id: "c1", key: "matematik", isCustom: false, name: "Matematik", color: "mavi", removalStatus: "none", removed: false }],
  grades: [
    { courseId: "c1", term: 1, examNo: 1, grade: 85.5, locked: true },
    { courseId: "c1", term: 2, examNo: 2, grade: 100 },
  ],
  ready: true,
  ...over,
});

describe("the parent's Yazılılar view", () => {
  const html = renderToStaticMarkup(<ParentSchoolExams data={data()} />);

  it("shows the grades per course / term / yazılı, with an em dash where nothing is entered", () => {
    expect(html).toContain("7. Sınıf yazılı notları");
    expect(html).toContain("85,5");
    expect(html).toContain("100");
    expect(html).toContain("—");
    for (const name of ["Matematik", "Türkçe", "Fen Bilimleri", "Sosyal Bilgiler", "İngilizce", "Din Kültürü ve Ahlak Bilgisi"]) expect(html).toContain(name);
  });

  it("is strictly read-only: no input, no button, no lock, no course-drop decision", () => {
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain("Onayla");
    expect(html).not.toContain("Reddet");
  });

  it("does not surface a pending course-drop request to the parent", () => {
    const pending = renderToStaticMarkup(
      <ParentSchoolExams data={data({ courses: [{ id: "c1", key: "din", isCustom: false, name: "Din", color: null, removalStatus: "pending", removed: false }] })} />,
    );
    expect(pending).not.toContain("almadığını bildirdi");
    expect(pending).not.toContain("<button");
  });

  it("says so when nothing is entered yet, and falls back calmly when the tables cannot be read", () => {
    expect(renderToStaticMarkup(<ParentSchoolExams data={data({ grades: [] })} />)).toContain("Henüz not girilmemiş");
    const broken = renderToStaticMarkup(<ParentSchoolExams data={data({ ready: false })} />);
    expect(broken).toContain("şu anda gösterilemiyor");
    expect(broken).not.toContain("Matematik");
  });
});
