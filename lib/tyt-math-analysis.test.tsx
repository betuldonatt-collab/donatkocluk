import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});

import { courseOptionsFor } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { BransAnalysisClient } from "@/app/student/deneme-analizleri/brans/brans-analysis-client";
import { ExamDetailDialog } from "@/app/coach/students/[id]/_components/exam-detail-dialog";
import {
  TYT_MATH_ANALYSIS_LABEL,
  analysisCourseKey,
  branchExamAnalysisCourses,
  branchExamCourses,
  courseDisplayName,
  findAnalysisCourse,
  findCourseById,
  sameAnalysisCourse,
} from "./curriculum";
import { comparableBranchExams } from "./exam-detail";
import { computeNet } from "./scoring";

// TYT Matematik in the Branş analysis views: the combined course and the single-subject Matematik are ONE entry, labelled like the task
// dropdown ("TYT Matematik (Matematik + Geometri)"); Geometri stays its own entry. Only the analysis views -- never the task form or storage.

describe("the label", () => {
  it("is exactly what the task dropdown shows for the combined course", () => {
    const dropdown = courseOptionsFor("YKS", true, null, null);
    const fromDropdown = dropdown.find((o) => o.id === "tyt-matematik-macro")?.label;
    expect(fromDropdown).toBe("TYT Matematik (Matematik + Geometri)");
    expect(TYT_MATH_ANALYSIS_LABEL).toBe(fromDropdown);
  });
});

describe("branchExamAnalysisCourses('tyt')", () => {
  const list = branchExamAnalysisCourses("tyt");
  const names = list.map((c) => c.name);

  it("lists TYT Matematik once, as the combined course under the dropdown label", () => {
    expect(list.filter((c) => c.id === "tyt-matematik-macro")).toHaveLength(1);
    expect(list.find((c) => c.id === "tyt-matematik-macro")?.name).toBe("TYT Matematik (Matematik + Geometri)");
    expect(list.some((c) => c.id === "tyt-matematik")).toBe(false);
    expect(names).not.toContain("Matematik");
    expect(names).not.toContain("TYT Matematik");
  });

  it("keeps everything else: the other combined courses, Geometri on its own, and every other single subject", () => {
    expect(names.slice(0, 3)).toEqual(["TYT Sosyal", "TYT Matematik (Matematik + Geometri)", "TYT Fen"]);
    const original = branchExamCourses("tyt");
    expect(list).toHaveLength(original.length - 1);
    expect(list.some((c) => c.id === "tyt-geometri")).toBe(true);
    expect(list.some((c) => c.id === "tyt-fizik")).toBe(true);
  });

  it("the merged entry still carries the Matematik AND Geometri topics (so both read in one table)", () => {
    const merged = list.find((c) => c.id === "tyt-matematik-macro")!;
    expect(merged.units.map((u) => u.unit)).toEqual(["Matematik", "Geometri"]);
    const atomic = findCourseById("tyt-matematik")!;
    const mergedTopicIds = new Set(merged.units.flatMap((u) => u.topics.map((t) => t.id)));
    for (const topic of atomic.units.flatMap((u) => u.topics)) expect(mergedTopicIds.has(topic.id), topic.id).toBe(true);
  });

  it("AYT lists are unchanged", () => {
    for (const track of ["sayisal", "ea", "sozel"] as const) {
      expect(branchExamAnalysisCourses("ayt", track)).toEqual(branchExamCourses("ayt", track));
    }
  });

  it("nothing else changed: the stored courses and their display names are as they were", () => {
    expect(findCourseById("tyt-matematik-macro")?.name).toBe("TYT Matematik");
    expect(courseDisplayName("tyt-matematik", "Matematik")).toBe("TYT Matematik");
  });
});

describe("which exams belong to the entry", () => {
  it("an exam saved under the combined course and one under the single-subject Matematik are the same analysis entry", () => {
    expect(analysisCourseKey("tyt-matematik")).toBe("tyt-matematik-macro");
    expect(analysisCourseKey("tyt-matematik-macro")).toBe("tyt-matematik-macro");
    expect(sameAnalysisCourse("tyt-matematik", "tyt-matematik-macro")).toBe(true);
    expect(sameAnalysisCourse("tyt-matematik-macro", "tyt-matematik")).toBe(true);
  });
  it("Geometri and every other course stay apart", () => {
    expect(sameAnalysisCourse("tyt-geometri", "tyt-matematik-macro")).toBe(false);
    expect(sameAnalysisCourse("tyt-fizik", "tyt-fen-macro")).toBe(false);
    expect(sameAnalysisCourse("ayt-matematik", "tyt-matematik-macro")).toBe(false);
    expect(sameAnalysisCourse(null, "tyt-matematik-macro")).toBe(false);
    expect(sameAnalysisCourse("tyt-fizik", "tyt-fizik")).toBe(true);
  });
  it("findAnalysisCourse gives the merged, relabelled course for either id", () => {
    expect(findAnalysisCourse("tyt-matematik")?.name).toBe("TYT Matematik (Matematik + Geometri)");
    expect(findAnalysisCourse("tyt-matematik-macro")?.id).toBe("tyt-matematik-macro");
    expect(findAnalysisCourse("tyt-fizik")?.name).toBe("Fizik");
    expect(findAnalysisCourse("nope")).toBeNull();
  });
  it("the popup's comparison puts both kinds of Matematik exam side by side (Geometri apart)", () => {
    const e = (id: string, course: string, date: string) => ({ id, task_type: "branch_exam", course_id: course, task_date: date });
    const all = [e("m1", "tyt-matematik", "2026-10-03"), e("c1", "tyt-matematik-macro", "2026-10-10"), e("g1", "tyt-geometri", "2026-10-05")];
    expect(comparableBranchExams(all, all[0], () => true).map((x) => x.id)).toEqual(["c1", "m1"]);
    expect(comparableBranchExams(all, all[1], () => true).map((x) => x.id)).toEqual(["c1", "m1"]);
    expect(comparableBranchExams(all, all[2], () => true).map((x) => x.id)).toEqual(["g1"]);
  });
});

describe("the student's Branş page", () => {
  const exam = (id: string, courseId: string, date: string) =>
    ({
      id,
      task_date: date,
      task_type: "branch_exam",
      course_id: courseId,
      title: `TYT Matematik Branş Denemesi - Yayın ${id}`,
      total_count: 40,
      correct_count: 30,
      wrong_count: 6,
      empty_count: 4,
      duration_minutes: 60,
      analysis_pending: false,
      subject_scores: null,
    }) as never;
  const today = new Date().toISOString().slice(0, 10);
  const html = renderToStaticMarkup(
    <BransAnalysisClient
      initialExams={[exam("COMB", "tyt-matematik-macro", today), exam("SING", "tyt-matematik", today)]}
      initialMistakes={[]}
      initialHasMore={false}
      examType="YKS"
    />,
  );

  it("shows ONE TYT Matematik chip with the dropdown's label -- no bare 'Matematik' chip", () => {
    expect(html).toContain("TYT Matematik (Matematik + Geometri)");
    expect(html).not.toMatch(/>Matematik<\/button>/);
  });
});

describe("the coach's comparison popup", () => {
  it("is titled with the merged label, whichever kind of Matematik exam was clicked, and lists both kinds", () => {
    const e = (id: string, course: string, date: string) =>
      ({
        id,
        task_type: "branch_exam",
        course_id: course,
        task_date: date,
        title: `TYT Matematik Branş Denemesi - Yayın ${id}`,
        total_count: 40,
        correct_count: 30,
        wrong_count: 6,
        empty_count: 4,
        subject_scores: null,
        analysis_pending: false,
      }) as never;
    const comb = e("COMB", "tyt-matematik-macro", "2026-10-10");
    const sing = e("SING", "tyt-matematik", "2026-10-03");
    for (const focus of [sing, comb]) {
      const html = renderToStaticMarkup(
        <ExamDetailDialog
          exam={focus}
          allGeneralExams={[]}
          allBranchExams={[comb, sing]}
          isInRange={() => true}
          rangeLabel="Son 30 gün"
          markedByExam={new Map()}
          netOf={computeNet}
          onClose={() => {}}
          onEdit={() => {}}
        />,
      );
      expect(html).toContain("TYT Matematik (Matematik + Geometri) Branş Denemesi Karşılaştırması");
      expect(html).toContain("Yayın COMB");
      expect(html).toContain("Yayın SING");
    }
  });
});

describe("wiring", () => {
  it("the three pickers and the table filters use the shared analysis helpers", () => {
    for (const file of [
      "app/coach/students/[id]/_components/charts-tab.tsx",
      "app/coach/students/[id]/_components/coach-exam-analysis-section.tsx",
      "app/student/deneme-analizleri/brans/brans-analysis-client.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("branchExamAnalysisCourses(");
      expect(src, file).toContain("sameAnalysisCourse(");
    }
  });
  it("the task form is untouched: it still lists the combined and the single TYT Matematik as two choices", () => {
    expect(readFileSync("app/coach/students/[id]/_components/kanban/task-form-fields.tsx", "utf8")).not.toContain("branchExamAnalysisCourses");
  });
});
