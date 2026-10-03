import { describe, expect, it } from "vitest";

import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF_TYT_MERGED_COURSES, isMaarifTytMergedCourseId, splitUnitGradeTag } from "./maarif-tyt";

describe("MAARIF_TYT_MERGED_COURSES", () => {
  it("prefixes every merged course id with maarif-tyt-, recognized by isMaarifTytMergedCourseId", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      expect(c.id.startsWith("maarif-tyt-")).toBe(true);
      expect(isMaarifTytMergedCourseId(c.id)).toBe(true);
    }
    expect(isMaarifTytMergedCourseId("maarif9-matematik")).toBe(false);
    expect(isMaarifTytMergedCourseId(null)).toBe(false);
    expect(isMaarifTytMergedCourseId(undefined)).toBe(false);
  });

  it("concatenates 9th grade's units before 10th grade's, tagging each with its grade", () => {
    const math = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-matematik")!;
    const m9 = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-matematik")!;
    const m10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-matematik")!;
    expect(math.units).toHaveLength(m9.units.length + m10.units.length);
    expect(math.units.slice(0, m9.units.length).every((u) => u.unit.startsWith("(9. Sınıf) "))).toBe(true);
    expect(math.units.slice(m9.units.length).every((u) => u.unit.startsWith("(10. Sınıf) "))).toBe(true);
  });

  it("keeps every original topic id untouched, just concatenated (no synthetic ids)", () => {
    const math = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-matematik")!;
    const m9 = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-matematik")!;
    const m10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-matematik")!;
    const mergedTopicIds = math.units.flatMap((u) => u.topics.map((t) => t.id));
    const sourceTopicIds = [...m9.units, ...m10.units].flatMap((u) => u.topics.map((t) => t.id));
    expect(mergedTopicIds).toEqual(sourceTopicIds);
  });

  it("pairs 9th grade's Din with 10th grade's differently-named/ided Din Kültürü ve Ahlak Bilgisi", () => {
    const din = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-din-kulturu")!;
    const m9 = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-din")!;
    const m10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-din-kulturu-ve-ahlak-bilgisi")!;
    expect(din.name).toBe("Din Kültürü ve Ahlak Bilgisi");
    expect(din.units).toHaveLength(m9.units.length + m10.units.length);
  });

  it("Felsefe has no 9th-grade counterpart -- its merged course is 10th grade's units alone", () => {
    const felsefe = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-felsefe")!;
    const m10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-felsefe")!;
    expect(felsefe.units).toHaveLength(m10.units.length);
    expect(felsefe.units.every((u) => u.unit.startsWith("(10. Sınıf) "))).toBe(true);
  });

  it("has unique course ids and never an empty units list", () => {
    const ids = MAARIF_TYT_MERGED_COURSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MAARIF_TYT_MERGED_COURSES) expect(c.units.length).toBeGreaterThan(0);
  });
});

describe("splitUnitGradeTag", () => {
  it("puts the grade and the unit name in separate fields", () => {
    expect(splitUnitGradeTag("(10. Sınıf) 1. Ünite: Sözün Ezgisi")).toEqual({ grade: "10. Sınıf", title: "1. Ünite: Sözün Ezgisi" });
    expect(splitUnitGradeTag("(9. Sınıf) 4. Tema: Dilin Zenginliği")).toEqual({ grade: "9. Sınıf", title: "4. Tema: Dilin Zenginliği" });
  });

  it("a unit with no label of its own (İngilizce) is just the grade, with an empty title", () => {
    expect(splitUnitGradeTag("(10. Sınıf) ")).toEqual({ grade: "10. Sınıf", title: "" });
    const ingilizce = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-ingilizce")!;
    expect(ingilizce.units.some((u) => splitUnitGradeTag(u.unit).title === "")).toBe(true);
  });

  it("returns an untagged label whole, with no grade", () => {
    expect(splitUnitGradeTag("1. Ünite: Kuvvet ve Hareket")).toEqual({ grade: null, title: "1. Ünite: Kuvvet ve Hareket" });
    expect(splitUnitGradeTag("")).toEqual({ grade: null, title: "" });
  });

  it("round-trips every merged unit: each is tagged with its grade, with a clean title after it", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      for (const u of c.units) {
        const { grade, title } = splitUnitGradeTag(u.unit);
        expect(["9. Sınıf", "10. Sınıf"]).toContain(grade);
        expect(title).not.toMatch(/^\(/);
        expect(title).not.toMatch(/\p{Lu}{3,}/u);
      }
    }
  });

  it("the Türk Dili merge reads 9th grade's themes in Title Case", () => {
    const tde = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-turk-dili-ve-edebiyati")!;
    expect(tde.units[0].unit).toBe("(9. Sınıf) 1. Tema: Sözün İnceliği");
  });
});
