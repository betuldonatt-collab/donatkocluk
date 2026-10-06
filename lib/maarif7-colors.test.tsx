import { describe, expect, it } from "vitest";

import { cardBackgroundClass } from "@/app/coach/students/[id]/_components/kanban/task-card-body";
import { subjectTintClass } from "@/app/student/_components/daily-tasks/types";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { MAARIF7_KAYNAK_COURSES } from "./curriculum/maarif7";
import { subjectBackgroundClass } from "./subject-colors";

// 7th grade -> the 8th grade (LGS) course whose hue it shares
const PAIRS: [string, string][] = [
  ["maarif7-turkce", "lgs-turkce"],
  ["maarif7-sosyal-bilgiler", "lgs-inkilap-tarihi"],
  ["maarif7-din-kulturu-ve-ahlak-bilgisi", "lgs-din-kulturu"],
  ["maarif7-ingilizce", "lgs-ingilizce"],
  ["maarif7-matematik", "lgs-matematik"],
  ["maarif7-fen-bilimleri", "lgs-fen-bilimleri"],
];
const ALL_OPTIONS = [{}, { deepMaarif11: true }, { deepLgs: true }, { deepMaarif11: true, deepLgs: true }];

describe("7th grade: the 8th grade's subject hues, deeper tier, on every panel", () => {
  it("covers every 7th-grade course", () => {
    expect(MAARIF7_KAYNAK_COURSES.map((c) => c.id).sort()).toEqual(PAIRS.map(([m7]) => m7).sort());
  });

  it("no 7th-grade course is grey any more; each has its subject's hue", () => {
    for (const [m7] of PAIRS) expect(subjectBackgroundClass(m7, "question_bank"), m7).not.toBe("bg-slate-500/10");
  });

  it("each takes the SAME shade as the matching 8th-grade course (same hue, deeper tier); Sosyal Bilgiler = İnkılap Tarihi", () => {
    for (const [m7, lgs] of PAIRS) {
      const cls = subjectBackgroundClass(m7, "question_bank");
      expect(cls, m7).toMatch(/\/12$/);
      expect(cls, m7).toBe(subjectBackgroundClass(lgs, "question_bank", { deepLgs: true }));
    }
    expect(subjectBackgroundClass("maarif7-sosyal-bilgiler", "question_bank")).toBe(subjectBackgroundClass("lgs-inkilap-tarihi", "question_bank", { deepLgs: true }));
    expect(subjectBackgroundClass("maarif7-sosyal-bilgiler", "question_bank")).toBe(subjectBackgroundClass("tyt-tarih", "question_bank").replace("/6", "/12"));
  });

  it("needs no option: always the deeper tier, whatever the caller passes", () => {
    for (const [m7] of PAIRS) {
      const base = subjectBackgroundClass(m7, "question_bank");
      for (const options of ALL_OPTIONS) expect(subjectBackgroundClass(m7, "question_bank", options), `${m7} ${JSON.stringify(options)}`).toBe(base);
    }
  });

  it("a Branş Denemesi keeps its own (deepest) shade, a Genel Deneme its colour", () => {
    for (const [m7, lgs] of PAIRS) {
      expect(subjectBackgroundClass(m7, "branch_exam"), m7).toMatch(/\/20$/);
      expect(subjectBackgroundClass(m7, "branch_exam"), m7).toBe(subjectBackgroundClass(lgs, "branch_exam"));
    }
    expect(subjectBackgroundClass(null, "general_exam")).toBe("bg-[var(--subject-genel-deneme)]");
  });

  it("the routines stay in the lighter tier for a 7th grader", () => {
    expect(subjectBackgroundClass("paragraf", "question_bank")).toBe("bg-[var(--subject-turkce)]/6");
    expect(subjectBackgroundClass("kitap-okuma", "reading")).toBe("bg-[var(--subject-turkce)]/6");
    expect(subjectBackgroundClass("problem", "question_bank")).toBe("bg-[var(--subject-matematik)]/6");
    expect(subjectBackgroundClass("yeni-nesil-mat-dozu", "question_bank")).toBe("bg-[var(--subject-matematik)]/6");
    // next to the deeper regular courses of the same subjects
    expect(subjectBackgroundClass("maarif7-matematik", "question_bank")).toBe("bg-[var(--subject-matematik)]/12");
    expect(subjectBackgroundClass("maarif7-turkce", "question_bank")).toBe("bg-[var(--subject-turkce)]/12");
  });

  it("the same on the coach's, the student's and the parent's boards (one shared function)", () => {
    for (const [m7] of PAIRS) {
      const cls = subjectBackgroundClass(m7, "question_bank");
      expect(cardBackgroundClass({ course_id: m7, task_type: "question_bank" } as DetailTask), m7).toBe(cls);
      expect(subjectTintClass({ course_id: m7, task_type: "question_bank" } as never), m7).toBe(cls);
    }
  });

  it("nothing else moves: 9th / 10th grade and the TYT courses keep their tier", () => {
    expect(subjectBackgroundClass("maarif9-matematik", "question_bank")).toBe("bg-[var(--subject-matematik)]/6");
    expect(subjectBackgroundClass("maarif10-fizik", "question_bank")).toBe("bg-[var(--subject-fizik)]/6");
    expect(subjectBackgroundClass("tyt-matematik", "question_bank")).toBe("bg-[var(--subject-matematik)]/6");
  });
});
