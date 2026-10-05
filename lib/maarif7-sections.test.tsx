import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CourseTabs } from "@/components/course-tabs";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { LgsExamScoreGrid, emptyLgsInputs, lgsInputsIncomplete, lgsOverCapSubject } from "@/components/lgs-exam-score-grid";
import { MAARIF7_EXAM_SUBJECTS, MAARIF7_SUBJECT_GROUPS, coursesForMaarif7ExamSubject } from "./curriculum/subject-groups";
import { summarizeSectionNets } from "./lgs-exam";
import { MAARIF_GRADES, maarifCourseOptions, maarifCourseSections } from "./maarif-grade";

const names = (cs: { name: string }[]) => cs.map((c) => c.name.replace(/^7\. Sınıf /, ""));

describe("7th grade: the LGS Sözel / Sayısal sections", () => {
  it("has SÖZEL = Türkçe, Sosyal Bilgiler, Din Kültürü ve Ahlak Bilgisi, İngilizce and SAYISAL = Matematik, Fen Bilimleri", () => {
    const sections = maarifCourseSections(7)!;
    expect(sections.map((s) => s.label)).toEqual(["SÖZEL", "SAYISAL"]);
    expect(names(sections[0].courses)).toEqual(["Türkçe", "Sosyal Bilgiler", "Din Kültürü ve Ahlak Bilgisi", "İngilizce"]);
    expect(names(sections[1].courses)).toEqual(["Matematik", "Fen Bilimleri"]);
    // Every course of the grade sits in exactly one section.
    expect(sections.flatMap((s) => s.courses.map((c) => c.id)).sort()).toEqual(MAARIF_GRADES[7].courses.map((c) => c.id).sort());
  });

  it("agrees with the Genel Deneme: each section is exactly the courses of its exam subjects", () => {
    for (const g of MAARIF7_SUBJECT_GROUPS) {
      const label = g.label;
      const fromSubjects = MAARIF7_EXAM_SUBJECTS.filter((s) => s.section === label).flatMap((s) => s.courseIds);
      expect(g.courseIds).toEqual(fromSubjects);
    }
  });

  it("analyses a whole section at once (the analysis page's SÖZEL / SAYISAL tabs) as well as a single subject", () => {
    expect(coursesForMaarif7ExamSubject("sozel").map((c) => c.id)).toEqual(MAARIF7_SUBJECT_GROUPS[0].courseIds);
    expect(names(MAARIF_GRADES[7].coursesForExamSubject("sayisal"))).toEqual(["Matematik", "Fen Bilimleri"]);
    expect(names(MAARIF_GRADES[7].coursesForExamSubject("m7_fen"))).toEqual(["Fen Bilimleri"]);
    expect(MAARIF_GRADES[7].sectionGroups).toBe(MAARIF7_SUBJECT_GROUPS);
  });

  it("tags the course picker options with their section, Sözel first", () => {
    const options = maarifCourseOptions(7);
    expect(options.map((o) => [o.label, o.group])).toEqual([
      ["Türkçe", "SÖZEL"],
      ["Sosyal Bilgiler", "SÖZEL"],
      ["Din Kültürü ve Ahlak Bilgisi", "SÖZEL"],
      ["İngilizce", "SÖZEL"],
      ["Matematik", "SAYISAL"],
      ["Fen Bilimleri", "SAYISAL"],
    ]);
  });

  it("leaves the other grades flat: no sections, no group tags", () => {
    for (const g of [9, 10, 11] as const) {
      expect(maarifCourseSections(g)).toBeNull();
      expect(maarifCourseOptions(g).every((o) => o.group === undefined)).toBe(true);
      expect(MAARIF_GRADES[g].sectionGroups).toBeUndefined();
    }
  });
});

describe("7th grade course tabs", () => {
  const html = (grade: 7 | 9) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <CourseTabs render={(c) => <p>{c.name}</p>} />
      </MaarifGradeProvider>,
    );

  it("shows the SÖZEL and SAYISAL headings with their chips in order, and selects Türkçe first", () => {
    const out = html(7);
    expect(out).toContain("SÖZEL");
    expect(out).toContain("SAYISAL");
    const order = ["SÖZEL", ">Türkçe<", ">Sosyal Bilgiler<", ">Din Kültürü ve Ahlak Bilgisi<", ">İngilizce<", "SAYISAL", ">Matematik<", ">Fen Bilimleri<"];
    const positions = order.map((s) => out.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(out).toContain("<p>7. Sınıf Türkçe</p>");
  });

  it("keeps the 9th grade as one flat row (no section headings)", () => {
    const out = html(9);
    expect(out).not.toContain("SÖZEL");
    expect(out).not.toContain("SAYISAL");
  });
});

describe("7th grade section nets", () => {
  const row = (correct: number, wrong: number) => ({ correct, wrong, empty: null });
  const full = {
    m7_turkce: row(15, 3), // 14
    m7_sosyal: row(9, 0), // 9
    m7_din: row(6, 3), // 5
    m7_ingilizce: row(10, 0), // 10
    m7_matematik: row(12, 6), // 10
    m7_fen: row(18, 0), // 18
  };

  it("sums Sözel, Sayısal and the total (3 yanlış 1 doğruyu götürür)", () => {
    expect(summarizeSectionNets(MAARIF7_EXAM_SUBJECTS, full)).toEqual({ sozelNet: 38, sayisalNet: 28, totalNet: 66 });
  });

  it("is null until every subject has both Doğru and Yanlış", () => {
    expect(summarizeSectionNets(MAARIF7_EXAM_SUBJECTS, null)).toBeNull();
    expect(summarizeSectionNets(MAARIF7_EXAM_SUBJECTS, { ...full, m7_fen: { correct: 18, wrong: null, empty: null } })).toBeNull();
    const { m7_fen: _omit, ...rest } = full;
    void _omit;
    expect(summarizeSectionNets(MAARIF7_EXAM_SUBJECTS, rest)).toBeNull();
  });
});

describe("7th grade Genel Deneme result form: the LGS grid", () => {
  const render = (inputs = emptyLgsInputs(null, "maarif7")) =>
    renderToStaticMarkup(<LgsExamScoreGrid variant="maarif7" inputs={inputs} onChange={() => {}} />);

  it("is split into Sözel Bölüm and Sayısal Bölüm with the six subjects and their question counts", () => {
    const out = render();
    expect(out.indexOf("Sözel Bölüm")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("Sayısal Bölüm")).toBeGreaterThan(out.indexOf("Sözel Bölüm"));
    expect(out.indexOf("Matematik")).toBeGreaterThan(out.indexOf("Sayısal Bölüm"));
    for (const [label, q] of [["Türkçe", 20], ["Sosyal Bilgiler", 10], ["Din Kültürü", 10], ["İngilizce", 10], ["Matematik", 20], ["Fen Bilimleri", 20]] as const) {
      expect(out).toContain(label);
      expect(out).toContain("(" + q + " soru)");
    }
  });

  it("summarises Sözel / Sayısal / Toplam Net but has no puan (the 7th grade has none)", () => {
    const out = render();
    expect(out).toContain("Sözel Net");
    expect(out).toContain("Sayısal Net");
    expect(out).toContain("Toplam Net");
    expect(out).not.toContain("Yaklaşık Puan");
  });

  it("works on the 7th grade's own keys: Boş derived, cap and completeness checks", () => {
    const seeded = emptyLgsInputs({ m7_turkce: { correct: 15, wrong: 3, empty: null } }, "maarif7");
    expect(seeded.m7_turkce.empty).toBe("2");
    expect(Object.keys(seeded)).toEqual(MAARIF7_EXAM_SUBJECTS.map((s) => s.key));
    expect(lgsInputsIncomplete(seeded, "maarif7")).toBe(true);
    expect(lgsOverCapSubject({ ...seeded, m7_sosyal: { correct: "8", wrong: "3", empty: "" } }, "maarif7")?.label).toBe("Sosyal Bilgiler");
  });

  it("the LGS variant is unchanged: still shows the approximate puan", () => {
    const out = renderToStaticMarkup(<LgsExamScoreGrid inputs={emptyLgsInputs(null)} onChange={() => {}} />);
    expect(out).toContain("Yaklaşık Puan");
    expect(out).toContain("İnkılap Tarihi");
  });
});
