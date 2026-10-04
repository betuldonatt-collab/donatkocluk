// Guards the isolation between an 11th grader's two Kaynak Takibi tabs:
// "Maarif TYT" (merged 9th+10th, maarif-tyt-*, optionally laid out by
// maarif-tyt-structure.ts) and "11. Sınıf" (the grade's own maarif11-* data).
// The structure specs must never reach the native 11th-grade courses.
import { describe, expect, it } from "vitest";
import { MAARIF_GRADES } from "../maarif-grade";
import { MAARIF11_KAYNAK_COURSES, isMaarif11CourseId } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES, isMaarifTytMergedCourseId } from "./maarif-tyt";
import { maarifTytDenemeMappingFor } from "./maarif-tyt-deneme-mapping";
import { SUBJECT_SPECS } from "./maarif-tyt-structure";

const native = (id: string) => MAARIF11_KAYNAK_COURSES.find((c) => c.id === id)!;
const merged = (id: string) => MAARIF_TYT_MERGED_COURSES.find((c) => c.id === id)!;

describe("native 11th-grade courses stay on their own data", () => {
  it("Coğrafya keeps its 7 native units and 19 topics", () => {
    const c = native("maarif11-cografya");
    expect(c.name).toBe("11. Sınıf Coğrafya");
    expect(c.units.map((u) => u.unit)).toEqual([
      "1. Ünite: Coğrafyanın Doğası",
      "2. Ünite: Mekansal Bilgi Teknolojileri",
      "3. Ünite: Doğal Sistemler ve Süreçler",
      "4. Ünite: Beşeri Sistemler ve Süreçler",
      "5. Ünite: Ekonomik Faaliyetler ve Etkileri",
      "6. Ünite: Afetler ve Sürdürülebilir Çevre",
      "7. Ünite: Bölgeler, Ülkeler ve Küresel Bağlantılar",
    ]);
    expect(c.units.map((u) => u.topics.length)).toEqual([1, 1, 2, 2, 5, 3, 5]);
    expect(c.units[0].topics[0].name).toBe("Mekânsal Sorunlar Karşısında Coğrafya Bilimi");
    expect(c.units[1].topics[0].name).toBe("Web Tabanlı CBS Uygulamaları");
  });

  it("Tarih keeps its 3 native units and 11 topics (not the Maarif TYT buckets)", () => {
    const c = native("maarif11-tarih");
    expect(c.units.map((u) => u.unit)).toEqual([
      "1. Ünite: Değişen Dünyada Osmanlı (1683-1789)",
      "2. Ünite: Dönüşüm Sürecinde Osmanlı (1789-1908)",
      "3. Ünite: Savaşlar Sarmalında Osmanlı (1908-1918)",
    ]);
    expect(c.units.flatMap((u) => u.topics)).toHaveLength(11);
    expect(c.units.flatMap((u) => u.topics.map((t) => t.name))).not.toContain("Osmanlı Devleti'nin İlim ve İrfan Geleneği");
  });

  it("the 11th grade's own course list is all maarif11-* and none of the merged courses", () => {
    expect(MAARIF_GRADES[11].courses).toBe(MAARIF11_KAYNAK_COURSES);
    for (const c of MAARIF_GRADES[11].courses) {
      expect(c.id.startsWith("maarif11-")).toBe(true);
      expect(isMaarif11CourseId(c.id)).toBe(true);
      expect(isMaarifTytMergedCourseId(c.id)).toBe(false);
    }
  });
});

describe("Maarif TYT and 11. Sınıf share nothing", () => {
  it("course ids and topic ids are disjoint", () => {
    const nativeCourseIds = new Set(MAARIF11_KAYNAK_COURSES.map((c) => c.id));
    for (const c of MAARIF_TYT_MERGED_COURSES) expect(nativeCourseIds.has(c.id)).toBe(false);
    const nativeTopicIds = new Set(MAARIF11_KAYNAK_COURSES.flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.id))));
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      for (const u of c.units) for (const t of u.topics) expect(nativeTopicIds.has(t.id)).toBe(false);
    }
  });

  it("no native course object is shared with a merged one", () => {
    for (const n of MAARIF11_KAYNAK_COURSES) {
      for (const m of MAARIF_TYT_MERGED_COURSES) {
        expect(n).not.toBe(m);
        for (const nu of n.units) expect(m.units).not.toContain(nu);
      }
    }
  });

  it("the structure specs only target merged courses and only read 9th/10th sources", () => {
    for (const [id, spec] of Object.entries(SUBJECT_SPECS)) {
      expect(id.startsWith("maarif-tyt-")).toBe(true);
      expect(merged(id)).toBeDefined();
      for (const unit of spec.units) {
        for (const bucket of unit.buckets) {
          for (const src of bucket.from) expect(/^maarif(9|10)-/.test(src.course)).toBe(true);
        }
      }
    }
  });

  it("the bucketed Deneme view never applies to native 11th-grade courses", () => {
    expect(maarifTytDenemeMappingFor("maarif11-cografya")).toBeNull();
    expect(maarifTytDenemeMappingFor("maarif11-tarih")).toBeNull();
    expect(maarifTytDenemeMappingFor("maarif-tyt-cografya")).not.toBeNull();
    expect(maarifTytDenemeMappingFor("maarif-tyt-tarih")).not.toBeNull();
  });

  it("the merged Tarih is the bucketed layout and the native Tarih is not", () => {
    expect(merged("maarif-tyt-tarih").units.some((u) => u.unit.startsWith("5. Ünite: Beylikten Devlete"))).toBe(true);
    expect(native("maarif11-tarih").units.some((u) => u.unit.startsWith("5. Ünite"))).toBe(false);
  });
});
