import { describe, expect, it } from "vitest";

import { MAARIF10_COURSES, MAARIF10_GENEL_DENEME_SUBJECTS, isMaarif10CourseId } from "./maarif10";

const topicCount = (units: { topics: unknown[] }[]) => units.reduce((a, u) => a + u.topics.length, 0);

describe("maarif10 curriculum data", () => {
  it("has the ten Kaynak Takibi subjects (Title Case) with the sheet's topic counts", () => {
    const counts = Object.fromEntries(MAARIF10_COURSES.map((c) => [c.name, topicCount(c.units)]));
    expect(counts).toEqual({
      "10. Sınıf Türk Dili ve Edebiyatı": 25,
      "10. Sınıf Tarih": 14,
      "10. Sınıf Fizik": 21,
      "10. Sınıf Din Kültürü ve Ahlak Bilgisi": 17,
      "10. Sınıf Matematik": 21,
      "10. Sınıf Coğrafya": 18,
      "10. Sınıf Kimya": 18,
      "10. Sınıf Felsefe": 9,
      "10. Sınıf Biyoloji": 19,
      "10. Sınıf İngilizce": 8,
    });
  });

  it("lists Türk Dili ve Edebiyatı once (the sheet repeats it)", () => {
    expect(MAARIF10_COURSES.filter((c) => c.id === "maarif10-turk-dili-ve-edebiyati")).toHaveLength(1);
  });

  it("has unique, prefixed ids and no empty names", () => {
    const ids = [
      ...MAARIF10_COURSES.flatMap((c) => [c.id, ...c.units.flatMap((u) => u.topics.map((t) => t.id))]),
      ...MAARIF10_GENEL_DENEME_SUBJECTS.flatMap((s) => [s.id, ...s.units.flatMap((u) => u.topics.map((t) => t.id))]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MAARIF10_COURSES) {
      expect(isMaarif10CourseId(c.id)).toBe(true);
      for (const u of c.units) for (const t of u.topics) expect(t.name.trim()).not.toBe("");
    }
  });

  it("merges deeper headings and normalises unit labels", () => {
    const tde = MAARIF10_COURSES.find((c) => c.id === "maarif10-turk-dili-ve-edebiyati")!;
    expect(tde.units[0].unit).toBe("1. Ünite: Sözün Ezgisi");
    expect(tde.units[0].topics.map((t) => t.name)).toContain("Dil Bilgisi › İsimler (Adlar)");
    const kimya = MAARIF10_COURSES.find((c) => c.id === "maarif10-kimya")!;
    expect(kimya.units[2].unit).toBe("3. Ünite: Sürdürülebilirlik");
    expect(kimya.units[0].topics[0].name).toBe("1.1. Kimyasal Tepkimeler › 1.1.1. Kimyasal Tepkimelerin Oluşumu");
    const fizik = MAARIF10_COURSES.find((c) => c.id === "maarif10-fizik")!;
    expect(fizik.units[0].unit).toBe("1. Ünite: Kuvvet ve Hareket");
  });

  it("puts İngilizce's themes in a unit-less list", () => {
    const eng = MAARIF10_COURSES.find((c) => c.id === "maarif10-ingilizce")!;
    expect(eng.units).toHaveLength(1);
    expect(eng.units[0].unit).toBeNull();
    expect(eng.units[0].topics.map((t) => t.name)).toContain("Theme 3: Personal Life & Well-Being");
  });

  it("applies the typo fixes", () => {
    const all = MAARIF10_COURSES.flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.name)));
    expect(all).toContain("2.2. Ekolojik Sürdürülebilirlik › 2.2.1. Ekolojik Sürdürülebilirliğin Önemi");
    expect(all.some((n) => n.includes("Evrendeki Düzen"))).toBe(true);
    expect(all.some((n) => n.includes("Ameli-Fıkhi Yorumlar"))).toBe(true);
    expect(all.some((n) => n.includes("Sürürülebilirlik") || n.includes("Evdendeki"))).toBe(false);
  });

  it("mirrors the Genel Deneme sheet's groups and its unit-less Coğrafya / Din / Felsefe lists", () => {
    expect(MAARIF10_GENEL_DENEME_SUBJECTS.map((s) => `${s.group}/${s.name}`)).toEqual([
      "TÜRKÇE/Türk Dili ve Edebiyatı",
      "SOSYAL BİLİMLER/Tarih",
      "SOSYAL BİLİMLER/Coğrafya",
      "SOSYAL BİLİMLER/Din Kültürü ve Ahlak Bilgisi",
      "SOSYAL BİLİMLER/Felsefe",
      "MATEMATİK/Matematik",
      "FEN BİLİMLERİ/Fizik",
      "FEN BİLİMLERİ/Kimya",
      "FEN BİLİMLERİ/Biyoloji",
    ]);
    const bySubject = Object.fromEntries(MAARIF10_GENEL_DENEME_SUBJECTS.map((s) => [s.name, [s.units.length, topicCount(s.units)]]));
    expect(bySubject["Coğrafya"]).toEqual([1, 7]);
    expect(bySubject["Din Kültürü ve Ahlak Bilgisi"]).toEqual([1, 5]);
    expect(bySubject["Felsefe"]).toEqual([1, 9]);
    expect(bySubject["Türk Dili ve Edebiyatı"]).toEqual([4, 24]);
  });
});
