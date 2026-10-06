import { describe, expect, it } from "vitest";

import { cardBackgroundClass } from "@/app/coach/students/[id]/_components/kanban/task-card-body";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { LGS_COURSES } from "./curriculum";
import { subjectBackgroundClass } from "./subject-colors";

const LGS_IDS = ["lgs-turkce", "lgs-matematik", "lgs-fen-bilimleri", "lgs-inkilap-tarihi", "lgs-din-kulturu", "lgs-ingilizce"];

describe("8th grade (LGS): regular courses take the deeper tier on the coach's cards, same hues", () => {
  it("covers every LGS course", () => {
    expect(LGS_COURSES.map((c) => c.id).sort()).toEqual([...LGS_IDS].sort());
  });

  it("the deeper tier keeps each course's own hue -- only the weight changes (/6 -> /12)", () => {
    for (const id of LGS_IDS) {
      const light = subjectBackgroundClass(id, "question_bank");
      const deep = subjectBackgroundClass(id, "question_bank", { deepLgs: true });
      expect(light, id).toMatch(/\/6$/);
      expect(deep, id).toMatch(/\/12$/);
      expect(deep.replace(/\/12$/, ""), id).toBe(light.replace(/\/6$/, ""));
      expect(light).not.toBe("bg-slate-500/10");
    }
    expect(subjectBackgroundClass("lgs-matematik", "question_bank", { deepLgs: true })).toBe(subjectBackgroundClass("ayt-matematik-sayisal", "question_bank"));
  });

  it("a Branş Denemesi keeps exactly the shade it has now, with or without the option", () => {
    for (const id of LGS_IDS) {
      expect(subjectBackgroundClass(id, "branch_exam", { deepLgs: true }), id).toBe(subjectBackgroundClass(id, "branch_exam"));
      expect(subjectBackgroundClass(id, "branch_exam"), id).toMatch(/\/20$/);
    }
  });

  it("other task types of an LGS course (video, konu, extra) take the deeper tier too; a Genel Deneme stays its own colour", () => {
    for (const type of ["topic_study", "video", "extra_custom", "reading"]) {
      expect(subjectBackgroundClass("lgs-fen-bilimleri", type, { deepLgs: true })).toMatch(/\/12$/);
    }
    expect(subjectBackgroundClass(null, "general_exam", { deepLgs: true })).toBe(subjectBackgroundClass(null, "general_exam"));
  });

  it("is limited to LGS courses: nothing else moves", () => {
    for (const id of ["tyt-matematik", "ayt-fizik", "maarif9-fizik", "maarif10-fizik", "maarif7-matematik", "maarif-tyt-fizik", "paragraf", "yeni-nesil-mat-dozu"]) {
      expect(subjectBackgroundClass(id, "question_bank", { deepLgs: true }), id).toBe(subjectBackgroundClass(id, "question_bank"));
    }
  });

  it("without the option nothing changes (the student's and parent's boards keep what they had)", () => {
    for (const id of LGS_IDS) expect(subjectBackgroundClass(id, "question_bank")).toMatch(/\/6$/);
  });

  it("the coach's task cards use it", () => {
    const task = (course_id: string, task_type: string) => ({ course_id, task_type }) as DetailTask;
    expect(cardBackgroundClass(task("lgs-turkce", "question_bank"))).toBe("bg-[var(--subject-turkce)]/12");
    expect(cardBackgroundClass(task("lgs-turkce", "branch_exam"))).toBe("bg-[var(--subject-turkce)]/20");
    // the 11th grade's rule from before still holds
    expect(cardBackgroundClass(task("maarif11-fizik", "question_bank"))).toBe("bg-[var(--subject-fizik)]/12");
  });
});
