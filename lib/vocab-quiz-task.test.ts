import { describe, expect, it } from "vitest";

import {
  EXTRA_STUDY_TITLE,
  isOpenEndedExtra,
  pickVocabQuizTask,
  taskAfterAnswer,
  taskAfterRun,
  vocabProgressText,
  vocabQuizHref,
  vocabStatusLabel,
  vocabTaskUnit,
} from "./vocab-quiz-task";

const open = (status: string, total_count: number | null, correct_count: number | null) => ({ status, total_count, correct_count });

describe("taskAfterAnswer: any answer starts it, the target finishes it", () => {
  it("the first answer -- even a wrong one -- makes a pending task Yarım Yapıldı", () => {
    expect(taskAfterAnswer(open("pending", 30, 0), false)).toEqual({ status: "half_done", correct_count: 0, completed: false });
    expect(taskAfterAnswer(open("pending", 30, 0), true)).toEqual({ status: "half_done", correct_count: 1, completed: false });
  });
  it("a correct answer counts toward the word target; a miss or Pas Geç never takes progress back", () => {
    expect(taskAfterAnswer(open("half_done", 30, 12), true)).toEqual({ status: "half_done", correct_count: 13, completed: false });
    expect(taskAfterAnswer(open("pending", 30, 12), false)).toEqual({ status: "half_done", correct_count: 12, completed: false });
  });
  it("a miss on a task that is already Yarım Yapıldı writes nothing", () => {
    expect(taskAfterAnswer(open("half_done", 30, 12), false)).toBeNull();
  });
  it("reaching the target (exactly, not 5 short) makes it Yapıldı", () => {
    expect(taskAfterAnswer(open("half_done", 30, 29), true)).toEqual({ status: "done", correct_count: 30, completed: true });
    expect(taskAfterAnswer(open("half_done", 30, 25), true)?.status).toBe("half_done");
    expect(taskAfterAnswer(open("pending", 10, 0), true)?.status).toBe("half_done"); // a small target is not finished by one answer
  });
  it("never counts past the target", () => {
    expect(taskAfterAnswer(open("half_done", 10, 10), true)).toEqual({ status: "done", correct_count: 10, completed: true });
  });
  it("a task that is already Yapıldı is left alone", () => {
    expect(taskAfterAnswer(open("done", 30, 30), true)).toBeNull();
    expect(taskAfterAnswer(open("done", 30, 30), false)).toBeNull();
  });
  it("answering after 'Yapılmadı' moves it to Yarım Yapıldı again (the progress is the system's, not a pick)", () => {
    expect(taskAfterAnswer(open("not_done", 30, 4), false)?.status).toBe("half_done");
    expect(taskAfterAnswer(open("not_done", 30, 4), true)).toEqual({ status: "half_done", correct_count: 5, completed: false });
  });
  it("a task without a target never finishes by answers alone", () => {
    expect(taskAfterAnswer(open("pending", null, 0), true)).toEqual({ status: "half_done", correct_count: 1, completed: false });
    expect(taskAfterAnswer(open("half_done", null, 40), true)?.status).toBe("half_done");
  });
});

describe("taskAfterRun: the end of a quiz run", () => {
  it("finishes a task whose target was reached", () => {
    expect(taskAfterRun(open("half_done", 30, 30), 50)).toEqual({ status: "done", correct_count: 30, completed: true });
  });
  it("finishes a task with no target -- the run itself is the task", () => {
    expect(taskAfterRun(open("half_done", null, 8), 50)?.status).toBe("done");
  });
  it("finishes a task whose target is out of reach because every word of the unit is already learned", () => {
    expect(taskAfterRun(open("half_done", 30, 12), 0)?.status).toBe("done");
  });
  it("leaves a task with words still to learn and the target not reached at Yarım Yapıldı", () => {
    expect(taskAfterRun(open("half_done", 30, 12), 7)).toBeNull();
  });
  it("leaves a finished task alone", () => {
    expect(taskAfterRun(open("done", 30, 30), 0)).toBeNull();
  });
});

describe("which open task a quiz opened without a task belongs to (sidebar start)", () => {
  const rows = [
    { id: "sun", task_date: "2026-10-18" },
    { id: "wed", task_date: "2026-10-14" },
    { id: "tue", task_date: "2026-10-13" },
    { id: "old", task_date: "2026-09-20" },
  ];
  it("priority 1: today's open task", () => {
    expect(pickVocabQuizTask(rows, "2026-10-14")?.id).toBe("wed");
  });
  it("priority 2: no task today -> the most recent open one from before today (not next week's)", () => {
    expect(pickVocabQuizTask(rows, "2026-10-16")?.id).toBe("wed");
    expect(pickVocabQuizTask(rows, "2026-10-13")?.id).toBe("tue");
  });
  it("a task from before the latest week lock is frozen and never offered; the lock day itself is open", () => {
    expect(pickVocabQuizTask(rows, "2026-10-16", "2026-10-15")).toBeNull(); // wed, tue, old all before the lock
    expect(pickVocabQuizTask(rows, "2026-10-16", "2026-10-14")?.id).toBe("wed"); // dated ON the lock day = open
    expect(pickVocabQuizTask(rows, "2026-10-16", "2026-10-13")?.id).toBe("wed");
    expect(pickVocabQuizTask([{ id: "old", task_date: "2026-09-20" }], "2026-10-16", "2026-10-01")).toBeNull();
  });
  it("priority 3: nothing due (only upcoming tasks, or none) -> none: the quiz then records today's Ek Çalışma", () => {
    expect(pickVocabQuizTask([{ id: "late", task_date: "2026-10-25" }, { id: "soon", task_date: "2026-10-20" }], "2026-10-16")).toBeNull();
    expect(pickVocabQuizTask([], "2026-10-16")).toBeNull();
  });
});

describe("Ek Çalışma: the student's open-ended extra practice", () => {
  it("is titled 'Ek Çalışma'", () => {
    expect(EXTRA_STUDY_TITLE).toBe("Ek Çalışma");
  });
  it("is a student-made task with no word target", () => {
    expect(isOpenEndedExtra({ total_count: null, is_coach_assigned: false })).toBe(true);
    expect(isOpenEndedExtra({ total_count: 30, is_coach_assigned: false })).toBe(false);
    expect(isOpenEndedExtra({ total_count: null, is_coach_assigned: true })).toBe(false); // an assigned, count-less task is not re-opened
    expect(isOpenEndedExtra({ total_count: null })).toBe(false);
  });
  it("practising again after it was finished re-opens it (Yarım Yapıldı, counting on); a finished task never re-opens otherwise", () => {
    const done = { status: "done", total_count: null, correct_count: 8 };
    expect(taskAfterAnswer(done, true)).toBeNull();
    expect(taskAfterAnswer(done, true, { reopenDone: true })).toEqual({ status: "half_done", correct_count: 9, completed: false });
    expect(taskAfterAnswer(done, false, { reopenDone: true })).toEqual({ status: "half_done", correct_count: 8, completed: false });
  });
});

describe("small helpers", () => {
  it("the unit of a task and the link its card opens", () => {
    expect(vocabTaskUnit("3")).toBe(3);
    expect(vocabTaskUnit(null)).toBe(1);
    expect(vocabTaskUnit("99")).toBe(1);
    expect(vocabQuizHref(3, "abc")).toBe("/student/ingilizce-quiz?unit=3&task=abc");
    expect(vocabQuizHref(3)).toBe("/student/ingilizce-quiz?unit=3");
  });
  it("status and progress words", () => {
    expect(vocabStatusLabel("done")).toBe("Yapıldı");
    expect(vocabStatusLabel("half_done")).toBe("Yarım Yapıldı");
    expect(vocabStatusLabel("not_done")).toBe("Yapılmadı");
    expect(vocabStatusLabel("pending")).toBe("Bekliyor");
    expect(vocabProgressText({ total_count: 30, correct_count: 12 })).toBe("12/30 kelime");
    expect(vocabProgressText({ total_count: 30, correct_count: null })).toBe("0/30 kelime");
    expect(vocabProgressText({ total_count: null, correct_count: 5 })).toBe("5 kelime");
  });
});
