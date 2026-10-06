import { describe, expect, it } from "vitest";

import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  courseDisplayName,
  LGS_COURSES,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
} from "./curriculum";

describe("courseDisplayName: the TYT / AYT prefix is added once, never twice", () => {
  it("prefixes an atomic course's bare name", () => {
    expect(courseDisplayName("tyt-fizik", "Fizik")).toBe("TYT Fizik");
    expect(courseDisplayName("tyt-turkce", "Türkçe")).toBe("TYT Türkçe");
    expect(courseDisplayName("ayt-matematik-sayisal", "Matematik")).toBe("AYT Matematik");
  });

  it("leaves a combined branch-exam course's name alone (it already says TYT / AYT)", () => {
    expect(courseDisplayName("tyt-fen-macro", "TYT Fen")).toBe("TYT Fen");
    expect(courseDisplayName("tyt-sosyal-macro", "TYT Sosyal")).toBe("TYT Sosyal");
    expect(courseDisplayName("ayt-matematik-sayisal-macro", "AYT Matematik")).toBe("AYT Matematik");
  });

  it("never doubles it for any real TYT / AYT course or combined course", () => {
    const all = [
      ...TYT_COURSES,
      ...TYT_BRANCH_EXAM_MACRO_COURSES,
      ...AYT_COURSES_BY_TRACK.sayisal,
      ...AYT_COURSES_BY_TRACK.ea,
      ...AYT_COURSES_BY_TRACK.sozel,
      ...Object.values(AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK).flat(),
    ];
    expect(all.length).toBeGreaterThan(20);
    for (const course of all) {
      const shown = courseDisplayName(course.id, course.name);
      expect(shown, course.id).not.toMatch(/^(TYT|AYT) (TYT|AYT)\b/);
      expect(shown, course.id).toMatch(/^(TYT|AYT) /);
    }
  });

  it("changes nothing for LGS, Maarif and routine courses (no exam prefix)", () => {
    for (const c of LGS_COURSES) expect(courseDisplayName(c.id, c.name)).toBe(c.name);
    expect(courseDisplayName("maarif7-matematik", "7. Sınıf Matematik")).toBe("7. Sınıf Matematik");
    expect(courseDisplayName("paragraf", "Paragraf")).toBe("Paragraf");
    expect(courseDisplayName(null, "Görev")).toBe("Görev");
  });
});
