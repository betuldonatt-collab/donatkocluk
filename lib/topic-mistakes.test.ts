import { describe, expect, it } from "vitest";

import { hasMistake, toggleMistake, type MistakeEntry } from "./topic-mistakes";

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
