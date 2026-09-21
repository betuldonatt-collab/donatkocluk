import { describe, expect, it } from "vitest";
import {
  findCourseById,
  findTopicById,
  isRoutineCourseId,
  KARMA_TOPIC_ID,
  normalizeTr,
  ROUTINE_COURSES,
  topicsForCourse,
  TYT_COURSES,
} from "./index";

// Derived from the real loaded curriculum data rather than hardcoded IDs,
// so these stay valid if the underlying JSON is regenerated.
const realCourse = TYT_COURSES.find((c) => c.units.some((u) => u.topics.length > 0))!;
const realUnit = realCourse.units.find((u) => u.topics.length > 0)!;
const realTopic = realUnit.topics[0];

describe("findCourseById", () => {
  it("finds a real TYT course by id", () => {
    expect(findCourseById(realCourse.id)?.id).toBe(realCourse.id);
  });

  it("finds a routine pseudo-course (paragraf/problem)", () => {
    expect(findCourseById("paragraf")?.name).toBe("Paragraf");
  });

  it("returns null for an unknown id", () => {
    expect(findCourseById("not-a-real-course")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(findCourseById(null)).toBeNull();
    expect(findCourseById(undefined)).toBeNull();
  });
});

describe("findTopicById", () => {
  it("finds a real topic within its course", () => {
    expect(findTopicById(realCourse.id, realTopic.id)?.id).toBe(realTopic.id);
  });

  it("always resolves the synthetic karma topic regardless of course", () => {
    expect(findTopicById(realCourse.id, KARMA_TOPIC_ID)?.id).toBe(KARMA_TOPIC_ID);
    expect(findTopicById("paragraf", KARMA_TOPIC_ID)?.id).toBe(KARMA_TOPIC_ID);
  });

  it("returns null when the topic doesn't belong to the given course", () => {
    expect(findTopicById("paragraf", realTopic.id)).toBeNull();
  });

  it("returns null for a null topicId", () => {
    expect(findTopicById(realCourse.id, null)).toBeNull();
  });
});

describe("topicsForCourse", () => {
  it("always appends the synthetic karma topic", () => {
    const topics = topicsForCourse(realCourse);
    expect(topics.at(-1)?.id).toBe(KARMA_TOPIC_ID);
  });

  it("offers only karma for a unit-less routine course", () => {
    const topics = topicsForCourse(ROUTINE_COURSES[0]);
    expect(topics).toHaveLength(1);
    expect(topics[0].id).toBe(KARMA_TOPIC_ID);
  });
});

describe("isRoutineCourseId", () => {
  it("recognizes every routine pseudo-course", () => {
    expect(isRoutineCourseId("paragraf")).toBe(true);
    expect(isRoutineCourseId("problem")).toBe(true);
    expect(isRoutineCourseId("kitap-okuma")).toBe(true);
    expect(isRoutineCourseId("yeni-nesil-mat-dozu")).toBe(true);
  });

  it("every routine pseudo-course is recognized and has no units", () => {
    for (const c of ROUTINE_COURSES) {
      expect(isRoutineCourseId(c.id)).toBe(true);
      expect(c.units).toHaveLength(0);
    }
  });

  it("rejects a real curriculum course id", () => {
    expect(isRoutineCourseId(realCourse.id)).toBe(false);
  });
});

describe("normalizeTr", () => {
  it("strips Turkish diacritics and lowercases", () => {
    expect(normalizeTr("Sözel")).toBe("sozel");
    expect(normalizeTr("Coğrafya")).toBe("cografya");
  });

  it("handles the dotted/dotless İ-I distinction correctly", () => {
    // The classic Turkish-locale gotcha: a naive toLowerCase() maps
    // "İstanbul" -> "i̇stanbul" (with a combining dot) under some
    // engines, not the plain ASCII "istanbul" a search box expects.
    expect(normalizeTr("İstanbul")).toBe("istanbul");
    expect(normalizeTr("Işık")).toBe("isik");
  });

  it("makes visually different spellings compare equal", () => {
    expect(normalizeTr("Fizik")).toBe(normalizeTr("FİZİK"));
  });
});
