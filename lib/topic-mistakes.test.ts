import { describe, expect, it } from "vitest";

import { hasMistake, hasMistakeInGroup, toggleMistake, toggleMistakeInGroup, type MistakeEntry } from "./topic-mistakes";

const wrong = (topic: string, course = "c"): MistakeEntry => ({ course_id: course, topic_id: topic, status: "wrong" });
const blank = (topic: string, course = "c"): MistakeEntry => ({ course_id: course, topic_id: topic, status: "blank" });

describe("toggleMistake", () => {
  it("sets a Yanlış mark, and clears it on a second press", () => {
    const on = toggleMistake([], "c", "t1", "wrong");
    expect(on).toEqual([wrong("t1")]);
    expect(toggleMistake(on, "c", "t1", "wrong")).toEqual([]);
  });

  it("lets Yanlış and Boş sit on the SAME topic together", () => {
    const both = toggleMistake(toggleMistake([], "c", "t1", "wrong"), "c", "t1", "blank");
    expect(both).toEqual([wrong("t1"), blank("t1")]);
    expect(hasMistake(both, "c", "t1", "wrong")).toBe(true);
    expect(hasMistake(both, "c", "t1", "blank")).toBe(true);
  });

  it("pressing Boş never clears Yanlış, and the other way round", () => {
    const both = [wrong("t1"), blank("t1")];
    expect(toggleMistake(both, "c", "t1", "blank")).toEqual([wrong("t1")]);
    expect(toggleMistake(both, "c", "t1", "wrong")).toEqual([blank("t1")]);
  });

  it("only ever touches the topic (and course) that was pressed", () => {
    const state = [wrong("t1"), blank("t2"), wrong("t1", "other")];
    expect(toggleMistake(state, "c", "t1", "wrong")).toEqual([blank("t2"), wrong("t1", "other")]);
    expect(toggleMistake(state, "c", "t3", "blank")).toEqual([...state, blank("t3")]);
  });

  it("does not mutate the list it was given", () => {
    const state = [wrong("t1")];
    toggleMistake(state, "c", "t1", "blank");
    expect(state).toEqual([wrong("t1")]);
  });
});

describe("hasMistake", () => {
  it("is false for a different status, topic or course", () => {
    const state = [wrong("t1")];
    expect(hasMistake(state, "c", "t1", "blank")).toBe(false);
    expect(hasMistake(state, "c", "t2", "wrong")).toBe(false);
    expect(hasMistake(state, "other", "t1", "wrong")).toBe(false);
  });
});

describe("bucket rows (several hidden topics, one tick)", () => {
  const ids = ["t1", "t2", "t3"];

  it("ticking marks the first topic only, once", () => {
    const next = toggleMistakeInGroup([], "c", ids, "wrong");
    expect(next).toEqual([{ course_id: "c", topic_id: "t1", status: "wrong" }]);
    expect(hasMistakeInGroup(next, "c", ids, "wrong")).toBe(true);
    expect(hasMistakeInGroup(next, "c", ids, "blank")).toBe(false);
  });

  it("reads as marked when any member is (marks made on another member still show)", () => {
    expect(hasMistakeInGroup([{ course_id: "c", topic_id: "t3", status: "blank" }], "c", ids, "blank")).toBe(true);
  });

  it("un-ticking clears the status from every member, and leaves other statuses and buckets alone", () => {
    const selected = [
      { course_id: "c", topic_id: "t1", status: "wrong" as const },
      { course_id: "c", topic_id: "t3", status: "wrong" as const },
      { course_id: "c", topic_id: "t1", status: "blank" as const },
      { course_id: "c", topic_id: "other", status: "wrong" as const },
    ];
    expect(toggleMistakeInGroup(selected, "c", ids, "wrong")).toEqual([
      { course_id: "c", topic_id: "t1", status: "blank" },
      { course_id: "c", topic_id: "other", status: "wrong" },
    ]);
  });
});
