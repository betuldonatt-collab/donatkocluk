import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TargetsCompletionCard } from "@/app/coach/students/[id]/_components/targets-completion-card";
import type { DualCompletionStats } from "@/app/coach/students/[id]/types";
import { completionLayoutFor, groupStats, percentForBar, type CompletionLayout, type CompletionTask } from "./program-completion-bars";

// The overall Program Tamamlama bars: standard students keep Toplam + TYT + AYT; Maarif 9 / 10 / 11, the 7th grade and LGS get bars of their own.

const task = (course_id: string | null, status: string, over: Partial<CompletionTask> = {}): CompletionTask => ({
  task_type: "question_bank",
  title: "x",
  course_id,
  status,
  ...over,
});
const exam = (title: string, status: string): CompletionTask => task(null, status, { task_type: "general_exam", title });

const bars = (layout: CompletionLayout) => (layout.kind === "groups" ? layout.bars.map((b) => b.label) : null);

describe("which bars a student sees", () => {
  it("11th grade: Toplam + Maarif TYT + 11. Sınıf; 10th: Toplam + 9. Sınıf + 10. Sınıf; 9th: one 9. Sınıf bar, no Toplam", () => {
    expect(completionLayoutFor({ examType: "YKS", maarifGrade: 11 })).toMatchObject({ kind: "groups", showOverall: true });
    expect(bars(completionLayoutFor({ examType: "YKS", maarifGrade: 11 }))).toEqual(["Maarif TYT", "11. Sınıf"]);
    expect(completionLayoutFor({ examType: "YKS", maarifGrade: 10 })).toMatchObject({ showOverall: true });
    expect(bars(completionLayoutFor({ examType: "YKS", maarifGrade: 10 }))).toEqual(["9. Sınıf", "10. Sınıf"]);
    expect(completionLayoutFor({ examType: "YKS", maarifGrade: 9 })).toMatchObject({ showOverall: false });
    expect(bars(completionLayoutFor({ examType: "YKS", maarifGrade: 9 }))).toEqual(["9. Sınıf"]);
  });

  it("the 7th grade has Toplam only; LGS has Toplam + Sözel + Sayısal", () => {
    expect(completionLayoutFor({ examType: "YKS", maarifGrade: 7 })).toEqual({ kind: "groups", showOverall: true, bars: [] });
    const lgs = completionLayoutFor({ examType: "LGS", maarifGrade: null });
    expect(lgs).toMatchObject({ showOverall: true });
    expect(bars(lgs)).toEqual(["Sözel", "Sayısal"]);
  });

  it("everyone else -- a plain YKS student, a 12th grader, a Mezun (no Maarif flag left) -- stays standard", () => {
    expect(completionLayoutFor({ examType: "YKS", maarifGrade: null })).toEqual({ kind: "standard" });
  });
});

describe("what each bar counts", () => {
  const pct = (layout: CompletionLayout, key: string, tasks: CompletionTask[]) => {
    if (layout.kind !== "groups") throw new Error("not a grouped layout");
    return percentForBar(tasks, layout.bars.find((b) => b.key === key)!);
  };
  const m11 = completionLayoutFor({ examType: "YKS", maarifGrade: 11 });
  const m10 = completionLayoutFor({ examType: "YKS", maarifGrade: 10 });
  const lgs = completionLayoutFor({ examType: "LGS", maarifGrade: null });

  it("11th grade: Maarif TYT = the merged courses + Maarif TYT / 9th / 10th grade Genel Denemeler; 11. Sınıf = its own courses + own Genel Deneme", () => {
    const tasks = [
      task("maarif-tyt-matematik", "done"),
      task("maarif-tyt-fizik", "pending"),
      exam("Maarif TYT Genel Deneme - A", "done"),
      exam("9. SINIF Genel Deneme - B", "done"),
      exam("10. SINIF Genel Deneme - C", "pending"),
      task("maarif11-fizik", "done"),
      task("maarif11-kimya", "done"),
      task("maarif11-tarih", "pending"),
      exam("11. SINIF Genel Deneme - D", "done"),
      task("kitap-okuma", "done"), // fits no bar
      task("tyt-matematik", "done"), // not a Maarif course
    ];
    expect(pct(m11, "mtyt", tasks)).toBe(Math.round((3 / 5) * 100)); // done: maarif-tyt-matematik, mtyt exam, 9. exam of 5
    expect(pct(m11, "m11", tasks)).toBe(Math.round((3 / 4) * 100));
  });

  it("10th grade: 9. Sınıf and 10. Sınıf each count their own courses and Genel Denemeler", () => {
    const tasks = [
      task("maarif9-matematik", "done"),
      task("maarif9-fizik", "done"),
      exam("9. SINIF Genel Deneme", "pending"),
      task("maarif10-matematik", "done"),
      task("maarif10-kimya", "pending"),
      exam("10. SINIF Genel Deneme", "pending"),
    ];
    expect(pct(m10, "m9", tasks)).toBe(67);
    expect(pct(m10, "m10", tasks)).toBe(33);
  });

  it("9th grade: the single 9. Sınıf bar covers ALL of its tasks (the same figure Toplam would show)", () => {
    const m9 = completionLayoutFor({ examType: "YKS", maarifGrade: 9 });
    const tasks = [task("maarif9-matematik", "done"), task(null, "pending", { task_type: "reading" }), task("paragraf", "done"), task("maarif9-fizik", "pending")];
    expect(pct(m9, "m9", tasks)).toBe(50);
  });

  it("a bar with nothing due is '—' (null), never 0%", () => {
    expect(pct(m11, "m11", [task("maarif-tyt-matematik", "done")])).toBeNull();
    expect(pct(m10, "m10", [])).toBeNull();
  });

  it("LGS: Sözel and Sayısal take their subjects; the Genel Deneme and ... counts toward both; the routines go with their subject", () => {
    const tasks = [
      task("lgs-turkce", "done"),
      task("lgs-ingilizce", "pending"),
      task("paragraf", "done"),
      task("ingilizce-quiz", "done"),
      task("lgs-matematik", "done"),
      task("lgs-fen-bilimleri", "pending"),
      task("problem", "pending"),
      task("yeni-nesil-mat-dozu", "done"),
      exam("LGS Genel Deneme - X", "done"),
      task("kitap-okuma", "pending"), // fits neither
    ];
    // Sözel: turkce, ingilizce, paragraf, ingilizce-quiz, exam = 5, done 4
    expect(pct(lgs, "sozel", tasks)).toBe(80);
    // Sayısal: matematik, fen, problem, yeni nesil, exam = 5, done 3
    expect(pct(lgs, "sayisal", tasks)).toBe(60);
  });

  it("groupStats gives each bar its Dönem and Genel figure", () => {
    const stats = groupStats(m11, [task("maarif11-fizik", "done")], [task("maarif11-fizik", "done"), task("maarif11-kimya", "pending")]);
    expect(stats).toEqual([
      { key: "mtyt", label: "Maarif TYT", weekly: null, allTime: null },
      { key: "m11", label: "11. Sınıf", weekly: 100, allTime: 50 },
    ]);
    expect(groupStats({ kind: "standard" }, [], [])).toEqual([]);
  });
});

describe("the card", () => {
  const profile = { exam_type: "YKS", target_university: null, target_department: null, target_ranking: null } as never;
  const base = { overall: 80, tyt: 70, ayt: 60 };
  const card = (completion: Partial<DualCompletionStats>, examType: "YKS" | "LGS" = "YKS") =>
    renderToStaticMarkup(
      <TargetsCompletionCard
        studentId="s1"
        profile={{ ...(profile as object), exam_type: examType } as never}
        completion={{ weekly: base, allTime: base, layout: { kind: "standard" }, groups: [], ...completion }}
        subjectCompletion={[]}
        progressFrom="2026-10-01"
        progressTo="2026-10-28"
      />,
    );
  const g = (label: string, key = label) => ({ key, label, weekly: 50, allTime: 40 });

  it("a standard student's card is unchanged: Toplam, TYT and AYT", () => {
    const html = card({});
    for (const label of ["Toplam", "TYT", "AYT"]) expect(html).toContain(`>${label}<`);
  });

  it("an 11th grader sees Toplam, Maarif TYT and 11. Sınıf -- and no TYT / AYT", () => {
    const html = card({ layout: { kind: "groups", showOverall: true }, groups: [g("Maarif TYT"), g("11. Sınıf")] });
    for (const label of ["Toplam", "Maarif TYT", "11. Sınıf"]) expect(html).toContain(`>${label}<`);
    expect(html).not.toContain(">TYT<");
    expect(html).not.toContain(">AYT<");
  });

  it("a 9th grader sees one '9. Sınıf' bar and no Toplam", () => {
    const html = card({ layout: { kind: "groups", showOverall: false }, groups: [g("9. Sınıf")] });
    expect(html).toContain(">9. Sınıf<");
    expect(html).not.toContain(">Toplam<");
    expect(html).not.toContain(">TYT<");
  });

  it("the 7th grade sees Toplam only; an LGS student Toplam, Sözel and Sayısal", () => {
    const seventh = card({ layout: { kind: "groups", showOverall: true }, groups: [] });
    expect(seventh).toContain(">Toplam<");
    expect(seventh).not.toContain(">TYT<");
    expect(seventh).not.toContain(">AYT<");
    const lgs = card({ layout: { kind: "groups", showOverall: true }, groups: [g("Sözel"), g("Sayısal")] }, "LGS");
    for (const label of ["Toplam", "Sözel", "Sayısal"]) expect(lgs).toContain(`>${label}<`);
    expect(lgs).not.toContain(">TYT<");
  });
});
