import { describe, expect, it } from "vitest";

import { AYT_COURSES_BY_TRACK, findCourseById } from "./index";
import { mergeSiblingTopicStats, siblingCourseIds, SIBLING_COURSE_GROUPS } from "./sibling-courses";

const zero = { total: 0, correct: 0, wrong: 0, empty: 0 };
const stats = (byTopic: Record<string, { total: number; correct: number; wrong: number; empty: number }> = {}, karma = zero) => ({ byTopic, karma });
const topicNames = (courseId: string) => findCourseById(courseId)!.units.flatMap((u) => u.topics.map((t) => t.name));

describe("shared AYT subjects: which field tabs list them (the tabs themselves are unchanged)", () => {
  const ids = (track: "sayisal" | "ea" | "sozel") => AYT_COURSES_BY_TRACK[track].map((c) => c.id);

  it("Matematik and Geometri are in the Sayısal AND the Eşit Ağırlık tab -- and not in Sözel", () => {
    for (const subject of ["ayt-matematik", "ayt-geometri"]) {
      expect(ids("sayisal")).toContain(`${subject}-sayisal`);
      expect(ids("ea")).toContain(`${subject}-ea`);
      expect(ids("sozel").some((id) => id.startsWith(subject))).toBe(false);
    }
  });

  it("Edebiyat, Tarih 1 and Coğrafya 1 are in the Eşit Ağırlık AND the Sözel tab -- and not in Sayısal", () => {
    for (const subject of ["ayt-edebiyat", "ayt-tarih-1", "ayt-cografya-1"]) {
      expect(ids("ea")).toContain(`${subject}-ea`);
      expect(ids("sozel")).toContain(`${subject}-sozel`);
      expect(ids("sayisal").some((id) => id.startsWith(subject))).toBe(false);
    }
  });
});

describe("SIBLING_COURSE_GROUPS", () => {
  it("covers exactly those five shared subjects, each between the two fields that share it", () => {
    expect(SIBLING_COURSE_GROUPS).toEqual([
      ["ayt-matematik-sayisal", "ayt-matematik-ea"],
      ["ayt-geometri-sayisal", "ayt-geometri-ea"],
      ["ayt-edebiyat-ea", "ayt-edebiyat-sozel"],
      ["ayt-tarih-1-ea", "ayt-tarih-1-sozel"],
      ["ayt-cografya-1-ea", "ayt-cografya-1-sozel"],
    ]);
  });

  it("every group is made of real courses with the same topics, by name, in the same order (so stats can be added topic by topic)", () => {
    for (const group of SIBLING_COURSE_GROUPS) {
      for (const id of group) expect(findCourseById(id), id).not.toBeNull();
      const [first, ...rest] = group;
      for (const id of rest) expect(topicNames(id), `${first} vs ${id}`).toEqual(topicNames(first));
    }
  });

  it("siblingCourseIds: the other courses of a shared subject; none for a subject of one field only or for a TYT course", () => {
    expect(siblingCourseIds("ayt-matematik-sayisal")).toEqual(["ayt-matematik-ea"]);
    expect(siblingCourseIds("ayt-matematik-ea")).toEqual(["ayt-matematik-sayisal"]);
    expect(siblingCourseIds("ayt-edebiyat-sozel")).toEqual(["ayt-edebiyat-ea"]);
    for (const id of ["ayt-fizik", "ayt-felsefe", "ayt-tarih-2", "tyt-matematik", "lgs-matematik"]) expect(siblingCourseIds(id), id).toEqual([]);
  });
});

describe("mergeSiblingTopicStats: topic ids differ between the courses (Geometri, every (Genel) master) -- matched by position", () => {
  const one = { total: 6, correct: 4, wrong: 2, empty: 0 };

  it("Geometri: a number under the Sayısal topic id lands on the same topic of the EA course, and back", () => {
    const sayisal = stats({ "ayt-geometri-sayisal-u0-t0": one });
    const fromSayisal = mergeSiblingTopicStats("ayt-geometri-ea", (id) => (id === "ayt-geometri-sayisal" ? sayisal : undefined), stats());
    expect(fromSayisal.byTopic).toEqual({ "ayt-geometri-ea-u0-t0": one });
    const ea = stats({ "ayt-geometri-ea-u1-t1": one });
    const fromEa = mergeSiblingTopicStats("ayt-geometri-sayisal", (id) => (id === "ayt-geometri-ea" ? ea : undefined), stats());
    expect(fromEa.byTopic).toEqual({ "ayt-geometri-sayisal-u1-t1": one });
  });

  it("a (Genel) master of the unit is matched to the other course's master", () => {
    const sozel = stats({ "ayt-edebiyat-sozel-genel-u1": one });
    const view = mergeSiblingTopicStats("ayt-edebiyat-ea", (id) => (id === "ayt-edebiyat-sozel" ? sozel : undefined), stats());
    expect(view.byTopic).toEqual({ "ayt-edebiyat-ea-genel-u1": one });
  });

  it("every topic of every shared subject maps onto exactly one topic of its sibling (nothing lost, nothing doubled)", () => {
    for (const [a, b] of SIBLING_COURSE_GROUPS) {
      const all = Object.fromEntries(findCourseById(a)!.units.flatMap((u) => u.topics.map((t) => [t.id, one])));
      const view = mergeSiblingTopicStats(b, (id) => (id === a ? stats(all) : undefined), stats());
      expect(Object.keys(view.byTopic).sort(), `${a} -> ${b}`).toEqual(findCourseById(b)!.units.flatMap((u) => u.topics.map((t) => t.id)).sort());
    }
  });
});

describe("mergeSiblingTopicStats: a shared subject's table shows what was recorded under either field's course", () => {
  const t0 = "ayt-matematik-u0-t0";
  const t1 = "ayt-matematik-u0-t1";

  it("an EA student's Matematik table also shows the numbers recorded under the Sayısal Matematik course (and the other way round)", () => {
    const bySayisal = stats({ [t0]: { total: 30, correct: 20, wrong: 8, empty: 2 } });
    const byEa = stats({ [t0]: { total: 10, correct: 6, wrong: 3, empty: 1 }, [t1]: { total: 5, correct: 5, wrong: 0, empty: 0 } });
    const all: Record<string, ReturnType<typeof stats>> = { "ayt-matematik-sayisal": bySayisal, "ayt-matematik-ea": byEa };

    const eaView = mergeSiblingTopicStats("ayt-matematik-ea", (id) => all[id], byEa);
    expect(eaView.byTopic[t0]).toEqual({ total: 40, correct: 26, wrong: 11, empty: 3 });
    expect(eaView.byTopic[t1]).toEqual({ total: 5, correct: 5, wrong: 0, empty: 0 });

    const sayisalView = mergeSiblingTopicStats("ayt-matematik-sayisal", (id) => all[id], bySayisal);
    expect(sayisalView.byTopic[t0]).toEqual(eaView.byTopic[t0]);
    expect(sayisalView.byTopic[t1]).toEqual(eaView.byTopic[t1]);
  });

  it("numbers recorded only under the OTHER field's course appear (a topic the own course has nothing for)", () => {
    const bySozel = stats({ "ayt-edebiyat-u0-t0": { total: 12, correct: 9, wrong: 3, empty: 0 } });
    const view = mergeSiblingTopicStats("ayt-edebiyat-ea", (id) => (id === "ayt-edebiyat-sozel" ? bySozel : undefined), stats());
    expect(view.byTopic["ayt-edebiyat-u0-t0"]).toEqual({ total: 12, correct: 9, wrong: 3, empty: 0 });
  });

  it("the Karma row is summed too", () => {
    const view = mergeSiblingTopicStats(
      "ayt-geometri-ea",
      (id) => (id === "ayt-geometri-sayisal" ? stats({}, { total: 7, correct: 4, wrong: 2, empty: 1 }) : undefined),
      stats({}, { total: 3, correct: 3, wrong: 0, empty: 0 }),
    );
    expect(view.karma).toEqual({ total: 10, correct: 7, wrong: 2, empty: 1 });
  });

  it("is display-only: the stored objects are never modified", () => {
    const own = stats({ [t0]: { total: 1, correct: 1, wrong: 0, empty: 0 } });
    const other = stats({ [t0]: { total: 2, correct: 1, wrong: 1, empty: 0 } });
    mergeSiblingTopicStats("ayt-matematik-ea", (id) => (id === "ayt-matematik-sayisal" ? other : undefined), own);
    expect(own.byTopic[t0]).toEqual({ total: 1, correct: 1, wrong: 0, empty: 0 });
    expect(other.byTopic[t0]).toEqual({ total: 2, correct: 1, wrong: 1, empty: 0 });
  });

  it("a course that is not shared, or whose siblings hold nothing, gets its own stats object back untouched", () => {
    const own = stats({ "ayt-fizik-u0-t0": { total: 4, correct: 4, wrong: 0, empty: 0 } });
    expect(mergeSiblingTopicStats("ayt-fizik", () => undefined, own)).toBe(own);
    const mat = stats({ [t0]: { total: 1, correct: 1, wrong: 0, empty: 0 } });
    expect(mergeSiblingTopicStats("ayt-matematik-ea", () => undefined, mat)).toBe(mat);
  });
});
