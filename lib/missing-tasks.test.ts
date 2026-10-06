import { describe, expect, it } from "vitest";

import {
  findMissingTasks,
  groupMissingByDate,
  isKitapOkumaTask,
  MISSING_TASKS_WINDOW_DAYS,
  type MissingTaskInput,
} from "./missing-tasks";

const TODAY = "2026-10-10";

function task(over: Partial<MissingTaskInput> & { id: string }): MissingTaskInput {
  return {
    task_date: "2026-10-08",
    task_type: "question_bank",
    course_id: "lgs-matematik",
    status: "pending",
    is_approved_by_coach: true,
    evidence_image_paths: [],
    evidence_review_status: "none",
    ...over,
  };
}

const find = (tasks: MissingTaskInput[], requiresPhoto = true) => findMissingTasks(tasks, TODAY, { requiresPhoto });

describe("findMissingTasks", () => {
  it("looks back 7 days everywhere (the student page's card and the dashboard panel share the rule)", () => {
    expect(MISSING_TASKS_WINDOW_DAYS).toBe(7);
    const tasks = [
      task({ id: "yesterday", task_date: "2026-10-09" }),
      task({ id: "edge7", task_date: "2026-10-03" }), // exactly 7 days back: included
      task({ id: "day8", task_date: "2026-10-02" }), // 8 days back: out of the window
      task({ id: "day13", task_date: "2026-09-27" }),
    ];
    expect(find(tasks).map((m) => m.task.id).sort()).toEqual(["edge7", "yesterday"]);
  });

  it("lists a past-due pending task with no photo for an LGS student", () => {
    expect(find([task({ id: "a" })])).toEqual([{ task: expect.objectContaining({ id: "a" }), reason: "no_photo" }]);
  });

  it("never lists Kitap Okuma, by task type or by routine course", () => {
    const tasks = [
      task({ id: "r1", task_type: "reading" }),
      task({ id: "r2", task_type: "routine", course_id: "kitap-okuma" }),
      task({ id: "q", task_type: "question_bank" }),
    ];
    expect(find(tasks).map((m) => m.task.id)).toEqual(["q"]);
    expect(isKitapOkumaTask({ task_type: "reading", course_id: null })).toBe(true);
    expect(isKitapOkumaTask({ task_type: "question_bank", course_id: "lgs-matematik" })).toBe(false);
  });

  it("skips completed tasks, today's and future tasks, and tasks older than the window", () => {
    const tasks = [
      task({ id: "done", status: "done" }),
      task({ id: "half", status: "half_done" }),
      task({ id: "today", task_date: TODAY }),
      task({ id: "future", task_date: "2026-10-12" }),
      task({ id: "old", task_date: "2026-09-20" }),
      task({ id: "edge", task_date: "2026-10-03" }), // exactly 7 days back: included
    ];
    expect(find(tasks).map((m) => m.task.id)).toEqual(["edge"]);
  });

  it("skips tasks the coach hasn't approved and photos already waiting for review", () => {
    const tasks = [
      task({ id: "unapproved", is_approved_by_coach: false }),
      task({ id: "held", evidence_review_status: "pending", evidence_image_paths: ["p"] }),
    ];
    expect(find(tasks)).toEqual([]);
  });

  it("explains why: rejected photo, not done, or simply incomplete", () => {
    const tasks = [
      task({ id: "rej", evidence_review_status: "rejected", evidence_image_paths: ["p"] }),
      task({ id: "nd", status: "not_done", evidence_image_paths: ["p"] }),
      task({ id: "inc", evidence_image_paths: ["p"] }),
    ];
    expect(Object.fromEntries(find(tasks).map((m) => [m.task.id, m.reason]))).toEqual({
      rej: "photo_rejected",
      nd: "not_done",
      inc: "incomplete",
    });
  });

  it("non-LGS students never get a photo reason, but their undone tasks still show", () => {
    const m = find([task({ id: "y", course_id: "tyt-matematik" }), task({ id: "n", status: "not_done" })], false);
    expect(m.map((x) => x.reason)).toEqual(["incomplete", "not_done"]);
  });

  it("a vocab quiz is never a missing-photo task", () => {
    expect(find([task({ id: "v", task_type: "vocab_quiz" })])[0].reason).toBe("incomplete");
  });

  it("sorts newest day first", () => {
    const tasks = [task({ id: "a", task_date: "2026-10-05" }), task({ id: "b", task_date: "2026-10-09" })];
    expect(find(tasks).map((m) => m.task.id)).toEqual(["b", "a"]);
  });
});

describe("groupMissingByDate", () => {
  it("writes each day once, keeping order and the tasks under it", () => {
    const items = [
      { id: "a", task_date: "2026-10-09" },
      { id: "b", task_date: "2026-10-09" },
      { id: "c", task_date: "2026-10-07" },
    ];
    expect(groupMissingByDate(items)).toEqual([
      { date: "2026-10-09", items: [items[0], items[1]] },
      { date: "2026-10-07", items: [items[2]] },
    ]);
    expect(groupMissingByDate([])).toEqual([]);
  });
});
