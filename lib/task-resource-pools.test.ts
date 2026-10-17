import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resourcePoolOf, resourcesAfterTaskTypeChange } from "./task-resource-pools";

// The coach's task form keeps the chosen kaynaklar when the Görev Türü changes to a type of the same list, and clears them only when the
// new type cannot use them.

type Row = { resourceId: string; resourceName: string };
const chosen: Row[] = [
  { resourceId: "r1", resourceName: "3D Fizik" },
  { resourceId: "", resourceName: "Yeni kaynak" },
];
const empty = (): Row => ({ resourceId: "", resourceName: "" });
const after = (from: string, to: string) => resourcesAfterTaskTypeChange(from, to, chosen, empty);

describe("resourcePoolOf", () => {
  it("Soru Çözümü, Kaynak Taraması and Konu Çalışması / Video share the study resources; Branş Denemesi has its own; the rest use none", () => {
    for (const type of ["question_bank", "resource_review", "topic_study", "video"]) expect(resourcePoolOf(type), type).toBe("study");
    expect(resourcePoolOf("branch_exam")).toBe("branch");
    for (const type of ["general_exam", "reading", "vocab_quiz", "extra_custom", "", null, undefined]) expect(resourcePoolOf(type as never), String(type)).toBeNull();
  });
});

describe("changing the Görev Türü", () => {
  it("keeps the chosen resources between the types that use the same list", () => {
    const types = ["question_bank", "topic_study", "resource_review"];
    for (const from of types) for (const to of types) expect(after(from, to), `${from} -> ${to}`).toBe(chosen);
  });

  it("clears them when the new type uses no resources (Genel Deneme, Kitap Okuma, ...): nothing hidden stays in the form", () => {
    for (const to of ["general_exam", "reading", "vocab_quiz"]) expect(after("question_bank", to), to).toEqual([]);
  });

  it("clears them for the other list (study <-> Branş Denemesi); Branş Denemesi starts with one empty row for its publisher", () => {
    expect(after("question_bank", "branch_exam")).toEqual([empty()]);
    expect(after("topic_study", "branch_exam")).toEqual([empty()]);
    expect(after("branch_exam", "question_bank")).toEqual([]);
    expect(after("branch_exam", "resource_review")).toEqual([]);
  });

  it("a Branş Denemesi form re-selected as Branş Denemesi keeps its rows; coming back from a type without resources starts empty", () => {
    expect(after("branch_exam", "branch_exam")).toBe(chosen);
    expect(after("general_exam", "question_bank")).toEqual([]);
    expect(after("general_exam", "branch_exam")).toEqual([empty()]);
  });
});

describe("wiring", () => {
  it("the form's Görev Türü handler uses it, and the course / topic still reset only when the course changes", () => {
    const src = readFileSync(new URL("../app/coach/students/[id]/_components/kanban/task-form-fields.tsx", import.meta.url), "utf8");
    expect(src).toContain("resourcesAfterTaskTypeChange(value.taskType, taskType, value.resources, emptyResourceRow)");
    expect(src).not.toContain('resources: taskType === "branch_exam" ? [emptyResourceRow()] : [],');
    // a different course has its own resources: that reset is unchanged
    expect(src).toContain('set({ courseId, topicId: "", resources: [] })');
  });
});
