import { describe, expect, it } from "vitest";

import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  findCourseById,
  type Course,
  type Track,
} from "./index";
import { canonicalCourseId, canonicalTopicId, LEGACY_COURSE_ID_MAP } from "./legacy-course-ids";
import { curriculumCourseIdsFor, YKS_CURRICULUM_COURSE_IDS } from "./cohort";
import { AYT_SUBJECT_GROUPS_BY_TRACK } from "./subject-groups";
import { karneTopicRowsForCourse, type KarneTopicRow } from "../karne";

const TRACKS: Track[] = ["sayisal", "ea", "sozel"];
const SHARED: Record<string, Track[]> = {
  "ayt-matematik": ["sayisal", "ea"],
  "ayt-geometri": ["sayisal", "ea"],
  "ayt-edebiyat": ["ea", "sozel"],
  "ayt-tarih-1": ["ea", "sozel"],
  "ayt-cografya-1": ["ea", "sozel"],
};
const ids = (track: Track) => AYT_COURSES_BY_TRACK[track].map((c) => c.id);

describe("the shared AYT subjects are ONE course each", () => {
  it("every field's tab lists them, and it is the very same course object in each field", () => {
    for (const [id, tracks] of Object.entries(SHARED)) {
      for (const track of TRACKS) expect(ids(track).includes(id), `${id} in ${track}`).toBe(tracks.includes(track));
      const objects = tracks.map((t) => AYT_COURSES_BY_TRACK[t].find((c) => c.id === id)!);
      for (const o of objects) expect(o).toBe(objects[0]);
    }
  });

  it("the tabs keep the same subjects, in the same order, as before", () => {
    expect(ids("sayisal")).toEqual(["ayt-matematik", "ayt-geometri", "ayt-fizik", "ayt-kimya", "ayt-biyoloji"]);
    expect(ids("ea")).toEqual(["ayt-edebiyat", "ayt-tarih-1", "ayt-cografya-1", "ayt-matematik", "ayt-geometri"]);
    expect(ids("sozel")).toEqual([
      "ayt-edebiyat",
      "ayt-tarih-1",
      "ayt-cografya-1",
      "ayt-tarih-2",
      "ayt-cografya-2",
      "ayt-felsefe",
      "ayt-psikoloji",
      "ayt-sosyoloji",
      "ayt-mantik",
      "ayt-din-kulturu-ve-ahlak-bilgisi",
    ]);
  });

  it("no course id carries a field any more (the only field-named ones left are the single-field combined 'AYT Fen' (Sayısal) and 'AYT Sos 2' (Sözel))", () => {
    const all = TRACKS.flatMap((t) => [...AYT_COURSES_BY_TRACK[t], ...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[t]]).map((c) => c.id);
    const fieldNamed = all.filter((id) => /-(sayisal|ea|sozel)(-macro)?$/.test(id));
    expect([...new Set(fieldNamed)].sort()).toEqual(["ayt-fen-sayisal-macro", "ayt-sos2-sozel-macro"]);
  });

  it("topic ids are unique across the whole curriculum: no topic id belongs to two courses (the shared topics exist once)", () => {
    const owner = new Map<string, string>();
    const courses = new Map<string, Course>();
    for (const track of TRACKS) for (const c of AYT_COURSES_BY_TRACK[track]) courses.set(c.id, c);
    for (const c of courses.values()) {
      for (const topic of c.units.flatMap((u) => u.topics)) {
        expect(owner.has(topic.id), `${topic.id} in ${c.id} and ${owner.get(topic.id)}`).toBe(false);
        owner.set(topic.id, c.id);
      }
    }
    // the shared courses keep their full topic sets (nothing lost in the merge)
    const count = (id: string) => findCourseById(id)!.units.reduce((n, u) => n + u.topics.length, 0);
    expect([count("ayt-matematik"), count("ayt-geometri"), count("ayt-edebiyat"), count("ayt-tarih-1"), count("ayt-cografya-1")]).toEqual([20, 8, 52, 44, 22]);
  });

  it("the combined branch exams are single too: 'AYT Matematik' (Sayısal + EA) and 'AYT Sos 1' (EA + Sözel)", () => {
    const macroIds = (t: Track) => AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[t].map((c) => c.id);
    expect(macroIds("sayisal")).toEqual(["ayt-matematik-macro", "ayt-fen-sayisal-macro"]);
    expect(macroIds("ea")).toEqual(["ayt-matematik-macro", "ayt-sos1-macro"]);
    expect(macroIds("sozel")).toEqual(["ayt-sos1-macro", "ayt-sos2-sozel-macro"]);
    expect(BRANCH_EXAM_MACRO_COURSES.map((c) => c.id).filter((id) => id === "ayt-matematik-macro")).toHaveLength(1);
    // a macro's topics are its sources' topics, under the unified ids
    expect(findCourseById("ayt-matematik-macro")!.units.map((u) => u.unit)).toEqual(["Matematik", "Geometri"]);
    expect(findCourseById("ayt-matematik-macro")!.units[1].topics.every((t) => t.id.startsWith("ayt-geometri-"))).toBe(true);
  });

  it("every course is found by id, once; the id lists the app builds contain each id once", () => {
    for (const id of Object.keys(SHARED)) expect(findCourseById(id)?.id).toBe(id);
    expect(new Set(YKS_CURRICULUM_COURSE_IDS).size).toBe(YKS_CURRICULUM_COURSE_IDS.length);
    expect(curriculumCourseIdsFor("YKS")).toContain("ayt-matematik");
    expect(curriculumCourseIdsFor("YKS").some((id) => id.endsWith("-ea") || id.endsWith("-sozel") || id === "ayt-matematik-sayisal")).toBe(false);
  });

  it("the exam sections still differ per field but point at the same courses (a Genel Deneme keeps its own subject keys)", () => {
    const sec = (track: Track, key: string) => AYT_SUBJECT_GROUPS_BY_TRACK[track].find((g) => g.key === key)!.courseIds;
    expect(sec("sayisal", "ayt_matematik")).toEqual(["ayt-matematik", "ayt-geometri"]);
    expect(sec("ea", "ayt_ea_matematik")).toEqual(["ayt-matematik", "ayt-geometri"]);
    expect(sec("ea", "ayt_ea_sozel1")).toEqual(["ayt-edebiyat", "ayt-tarih-1", "ayt-cografya-1"]);
    expect(sec("sozel", "ayt_sozel_sozel1")).toEqual(["ayt-edebiyat", "ayt-tarih-1", "ayt-cografya-1"]);
  });
});

describe("legacy ids (what migration 0133 rewrote, and what archived Karne snapshots still carry)", () => {
  it("every old course id maps to an existing unified course", () => {
    for (const [oldId, newId] of Object.entries(LEGACY_COURSE_ID_MAP)) {
      expect(findCourseById(oldId), `old ${oldId} is gone`).toBeNull();
      expect(findCourseById(newId), `new ${newId}`).not.toBeNull();
      expect(canonicalCourseId(oldId)).toBe(newId);
    }
    expect(canonicalCourseId("ayt-fizik")).toBe("ayt-fizik");
    expect(canonicalCourseId("tyt-matematik")).toBe("tyt-matematik");
  });

  it("old topic ids map onto real topics of the unified course: masters and all of Geometri; the plain shared topics are unchanged", () => {
    expect(canonicalTopicId("ayt-matematik-sayisal-genel-u1")).toBe("ayt-matematik-genel-u1");
    expect(canonicalTopicId("ayt-matematik-ea-genel-u2")).toBe("ayt-matematik-genel-u2");
    expect(canonicalTopicId("ayt-geometri-ea-u0-t0")).toBe("ayt-geometri-u0-t0");
    expect(canonicalTopicId("ayt-geometri-sayisal-genel-u1")).toBe("ayt-geometri-genel-u1");
    expect(canonicalTopicId("ayt-edebiyat-sozel-genel-u1")).toBe("ayt-edebiyat-genel-u1");
    expect(canonicalTopicId("ayt-tarih-1-ea-genel-u3")).toBe("ayt-tarih-1-genel-u3");
    expect(canonicalTopicId("ayt-cografya-1-sozel-genel-u0")).toBe("ayt-cografya-1-genel-u0");
    expect(canonicalTopicId("ayt-matematik-u0-t0")).toBe("ayt-matematik-u0-t0");
    expect(canonicalTopicId("karma")).toBe("karma");
    // every mapped id really exists in the unified curriculum
    for (const id of ["ayt-matematik-genel-u1", "ayt-geometri-u0-t0", "ayt-edebiyat-genel-u1", "ayt-tarih-1-genel-u3", "ayt-cografya-1-genel-u0"]) {
      const course = findCourseById(id.startsWith("ayt-geometri") ? "ayt-geometri" : id.replace(/-(genel|u\d+).*$/, ""))!;
      expect(course.units.flatMap((u) => u.topics.map((t) => t.id)), id).toContain(id);
    }
  });

  it("no unified topic id is itself rewritten by the map (nothing is renamed twice)", () => {
    for (const id of Object.keys(SHARED)) {
      for (const topic of findCourseById(id)!.units.flatMap((u) => u.topics)) expect(canonicalTopicId(topic.id), topic.id).toBe(topic.id);
    }
  });
});

describe("archived Karne snapshots are read through the unified ids", () => {
  const row = (courseId: string, topicId: string, count: number, windowSize: number): KarneTopicRow => ({ courseId, courseName: "Matematik", topicId, topicName: "x", count, windowSize });

  it("a snapshot saved with the old per-field ids shows under the unified course", () => {
    const rows = [row("ayt-matematik-sayisal", "ayt-matematik-u0-t0", 2, 4), row("ayt-fizik", "ayt-fizik-u0-t0", 1, 3)];
    expect(karneTopicRowsForCourse(rows, "ayt-matematik").map((r) => [r.courseId, r.topicId, r.count, r.windowSize])).toEqual([["ayt-matematik", "ayt-matematik-u0-t0", 2, 4]]);
    expect(karneTopicRowsForCourse(rows, "ayt-fizik")).toHaveLength(1);
  });

  it("a topic present under both old copies becomes one row: mistakes add up, the window is the larger one -- masters and Geometri included", () => {
    const rows = [
      row("ayt-matematik-sayisal", "ayt-matematik-sayisal-genel-u1", 3, 5),
      row("ayt-matematik-ea", "ayt-matematik-ea-genel-u1", 0, 3),
      row("ayt-geometri-sayisal", "ayt-geometri-sayisal-u0-t0", 1, 2),
      row("ayt-geometri-ea", "ayt-geometri-ea-u0-t0", 1, 2),
    ];
    expect(karneTopicRowsForCourse(rows, "ayt-matematik")).toMatchObject([{ topicId: "ayt-matematik-genel-u1", count: 3, windowSize: 5 }]);
    expect(karneTopicRowsForCourse(rows, "ayt-geometri")).toMatchObject([{ topicId: "ayt-geometri-u0-t0", count: 2, windowSize: 2 }]);
  });

  it("a snapshot already on the unified ids, and any other course, is read as it is", () => {
    const rows = [row("ayt-edebiyat", "ayt-edebiyat-u0-t0", 4, 4), row("tyt-turkce", "tyt-turkce-u0-t0", 1, 1)];
    expect(karneTopicRowsForCourse(rows, "ayt-edebiyat")).toHaveLength(1);
    expect(karneTopicRowsForCourse(rows, "tyt-turkce")).toHaveLength(1);
    expect(karneTopicRowsForCourse(rows, "ayt-tarih-1")).toEqual([]);
  });

  it("rows come back with the most-missed topics first", () => {
    const rows = [row("ayt-matematik", "ayt-matematik-u0-t0", 1, 4), row("ayt-matematik", "ayt-matematik-u0-t1", 3, 4)];
    expect(karneTopicRowsForCourse(rows, "ayt-matematik").map((r) => r.count)).toEqual([3, 1]);
  });
});
