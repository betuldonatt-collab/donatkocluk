import { describe, expect, it } from "vitest";

import { MAARIF9_COURSES, MAARIF9_GENEL_DENEME_SUBJECTS, isMaarif9CourseId } from "./maarif9";

const topicCount = (units: { topics: unknown[] }[]) => units.reduce((a, u) => a + u.topics.length, 0);

describe("maarif9 curriculum data", () => {
  it("has the nine Kaynak Takibi subjects with the sheet's topic counts", () => {
    const counts = Object.fromEntries(MAARIF9_COURSES.map((c) => [c.name, topicCount(c.units)]));
    expect(counts).toEqual({
      "9. Sınıf TÜRK DİLİ VE EDEBİYATI": 23,
      "9. Sınıf: MATEMATİK": 20,
      "9. Sınıf COĞRAFYA": 22,
      "9. Sınıf İNGİLİZCE": 8,
      "9. Sınıf FİZİK": 24,
      "9. Sınıf KİMYA": 20,
      "9. Sınıf DİN": 20,
      "9. Sınıf TARİH": 13,
      "9. Sınıf BİYOLOJİ": 45,
    });
  });

  it("has unique, prefixed ids and no empty names", () => {
    const ids = [
      ...MAARIF9_COURSES.flatMap((c) => [c.id, ...c.units.flatMap((u) => u.topics.map((t) => t.id))]),
      ...MAARIF9_GENEL_DENEME_SUBJECTS.flatMap((s) => [s.id, ...s.units.flatMap((u) => u.topics.map((t) => t.id))]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MAARIF9_COURSES) expect(isMaarif9CourseId(c.id)).toBe(true);
    for (const c of MAARIF9_COURSES) {
      for (const u of c.units) {
        expect(u.unit).toBeTruthy();
        for (const t of u.topics) expect(t.name.trim()).not.toBe("");
      }
    }
  });

  it("merges deeper headings into the topic name", () => {
    const tde = MAARIF9_COURSES.find((c) => c.id === "maarif9-turk-dili-ve-edebiyati")!;
    expect(tde.units[0].unit).toBe("TEMA 1: SÖZÜN İNCELİĞİ");
    expect(tde.units[0].topics.map((t) => t.name)).toContain("1.2. Metin Türleri › Deneme");
    const bio = MAARIF9_COURSES.find((c) => c.id === "maarif9-biyoloji")!;
    expect(bio.units[0].topics.map((t) => t.name)).toContain(
      "1.6. Sınıflandırmada Üç Üst Âlem (Domain) Sistemi › 1.6.1. Biyolojik Sınıflandırma Sistemi › Bakteriler",
    );
  });

  it("mirrors the Genel Deneme sheet's groups and its units-only Din list", () => {
    expect(MAARIF9_GENEL_DENEME_SUBJECTS.map((s) => `${s.group}/${s.name}`)).toEqual([
      "TÜRKÇE/TÜRK DİLİ VE EDEBİYATI",
      "SOSYAL BİLİMLER/TARİH",
      "SOSYAL BİLİMLER/COĞRAFYA",
      "SOSYAL BİLİMLER/DİN KÜLTÜRÜ",
      "MATEMATİK/MATEMATİK",
      "FEN BİLİMLERİ/FİZİK",
      "FEN BİLİMLERİ/KİMYA",
      "FEN BİLİMLERİ/BİYOLOJİ",
    ]);
    const din = MAARIF9_GENEL_DENEME_SUBJECTS.find((s) => s.name === "DİN KÜLTÜRÜ")!;
    expect(din.units).toHaveLength(5);
    expect(topicCount(din.units)).toBe(0);
    expect(MAARIF9_GENEL_DENEME_SUBJECTS[0].units[0].unit).toBeNull();
  });
});
