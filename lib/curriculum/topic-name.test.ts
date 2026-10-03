import { describe, expect, it } from "vitest";

import { MAARIF9_COURSES, MAARIF9_GENEL_DENEME_SUBJECTS } from "./maarif9";
import { MAARIF10_COURSES, MAARIF10_GENEL_DENEME_SUBJECTS } from "./maarif10";
import { MAARIF11_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { LGS_COURSES } from "./index";
import { normalizeUnitLabel, stripKonuNumberPrefix, stripTopicNumberPrefix, withCleanNames } from "./topic-name";

describe("stripTopicNumberPrefix", () => {
  it("strips Number.Number. and Number.Number.Number. prefixes", () => {
    expect(stripTopicNumberPrefix("4.4. Dil Bilgisi › Sıfatlar")).toBe("Dil Bilgisi › Sıfatlar");
    expect(stripTopicNumberPrefix("3.3. Şiir İnceleme")).toBe("Şiir İnceleme");
    expect(stripTopicNumberPrefix("1.1.1. Kimyasal Tepkimelerin Oluşumu")).toBe("Kimyasal Tepkimelerin Oluşumu");
  });

  it("strips a lone Number. prefix too", () => {
    expect(stripTopicNumberPrefix("4. Hücre")).toBe("Hücre");
  });

  it("strips the prefix of every ' › ' segment", () => {
    expect(stripTopicNumberPrefix("1.6. Sınıflandırma › 1.6.1. Domain Sistemi › Bakteriler")).toBe(
      "Sınıflandırma › Domain Sistemi › Bakteriler",
    );
  });

  it("leaves names without a leading number alone, including numbers elsewhere in the text", () => {
    expect(stripTopicNumberPrefix("Metin Türleri › Deneme")).toBe("Metin Türleri › Deneme");
    expect(stripTopicNumberPrefix("Atatürk ve 1. Dünya Savaşı")).toBe("Atatürk ve 1. Dünya Savaşı");
  });

  it("does not eat a number that is part of the name (no trailing dot + space)", () => {
    expect(stripTopicNumberPrefix("1960 Sonrası Türk Şiiri")).toBe("1960 Sonrası Türk Şiiri");
  });
});

describe("withCleanNames", () => {
  it("cleans topic names but keeps ids, unit labels and course names untouched", () => {
    const [course] = withCleanNames([
      { id: "c", name: "9. Sınıf Matematik", units: [{ unit: "TEMA 1", topics: [{ id: "t1", name: "1.2. Kümeler" }] }] },
    ]);
    expect(course.name).toBe("9. Sınıf Matematik");
    expect(course.units[0].unit).toBe("1. Tema");
    expect(course.units[0].topics[0]).toEqual({ id: "t1", name: "Kümeler" });
  });
});

describe("Maarif data shows no numeric markers anywhere", () => {
  // The dot is required: a leading year ("1755 Lizbon ...") is real text.
  const marker = /(^|\s›\s)\d+(\.\d+)*\.\s/;
  const allTopics = [
    ...MAARIF9_COURSES,
    ...MAARIF10_COURSES,
    ...MAARIF9_GENEL_DENEME_SUBJECTS,
    ...MAARIF10_GENEL_DENEME_SUBJECTS,
    ...MAARIF11_COURSES,
    ...MAARIF_TYT_MERGED_COURSES,
  ].flatMap((c) => c.units.flatMap((u) => u.topics));

  it("no topic name in any Maarif list starts a segment with a hierarchy number", () => {
    expect(allTopics.length).toBeGreaterThan(0);
    for (const t of allTopics) expect(t.name).not.toMatch(marker);
  });
});

describe("stripKonuNumberPrefix", () => {
  it("strips LGS's 'N.N ' Konu numbering (no trailing dot)", () => {
    expect(stripKonuNumberPrefix("1.1 Çarpanlar ve Katlar")).toBe("Çarpanlar ve Katlar");
    expect(stripKonuNumberPrefix("6.2 Geometrik Cisimler")).toBe("Geometrik Cisimler");
  });

  it("leaves a name that merely starts with a number alone", () => {
    expect(stripKonuNumberPrefix("2. Dünya savaşı ve demokrasi")).toBe("2. Dünya savaşı ve demokrasi");
    expect(stripKonuNumberPrefix("1960 Sonrası")).toBe("1960 Sonrası");
  });
});

describe("LGS data shows no Konu numbering", () => {
  it("no LGS konu label starts with a hierarchy number, and unit labels/topics are untouched", () => {
    const konus = LGS_COURSES.flatMap((c) => c.units.flatMap((u) => (u.konu === undefined ? [] : [u.konu])));
    expect(konus.length).toBeGreaterThan(0);
    for (const k of konus) expect(k).not.toMatch(/^\d+\.\d+/);
    const mat = LGS_COURSES.find((c) => c.id === "lgs-matematik")!;
    expect(mat.units[0].unit).toBe("1. ÜNİTE");
    expect(LGS_COURSES.flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.name)))).toContain(
      "2. Dünya savaşı ve demokrasi yolunda atılan adımlar",
    );
  });
});

describe("normalizeUnitLabel", () => {
  it("turns every 9th-grade shape into 'N. Tema/Ünite: Title Case'", () => {
    expect(normalizeUnitLabel("TEMA 4: DİLİN ZENGİNLİĞİ")).toBe("4. Tema: Dilin Zenginliği");
    expect(normalizeUnitLabel("1. TEMA: SAYILAR")).toBe("1. Tema: Sayılar");
    expect(normalizeUnitLabel("2. ÜNİTE: KUVVET VE HAREKET")).toBe("2. Ünite: Kuvvet ve Hareket");
    expect(normalizeUnitLabel("1.ÜNİTE: COĞRAFYANIN DOĞASI")).toBe("1. Ünite: Coğrafyanın Doğası");
    expect(normalizeUnitLabel("2. ÜNİTE: MEKÂNSAL BİLGİ TEKNOLOJİLERİ")).toBe("2. Ünite: Mekânsal Bilgi Teknolojileri");
    expect(normalizeUnitLabel("5.ÜNİTE: KUR'AN'A GÖRE HZ. MUHAMMED")).toBe("5. Ünite: Kur'an'a Göre Hz. Muhammed");
    expect(normalizeUnitLabel("THEME 4")).toBe("Theme 4");
  });

  it("leaves labels that are already clean alone (idempotent)", () => {
    for (const label of ["1. Ünite: Sözün Ezgisi", "1. Ünite", "3. Ünite: Nicelikler ve Değişimler (1)", "1. Ünite: Değişen Dünyada Osmanlı (1683-1789)"]) {
      expect(normalizeUnitLabel(label)).toBe(label);
      expect(normalizeUnitLabel(normalizeUnitLabel(label))).toBe(normalizeUnitLabel(label));
    }
  });

  it("fixes a stray capital 'Ve' in an otherwise mixed-case title", () => {
    expect(normalizeUnitLabel("3. Ünite: Doğal Sistemler Ve Süreçler")).toBe("3. Ünite: Doğal Sistemler ve Süreçler");
  });

  it("normalises the 11th grade's Türk Dili themes too", () => {
    expect(normalizeUnitLabel("3. TEMA: YAŞAMIN İZİNDE")).toBe("3. Tema: Yaşamın İzinde");
  });
});

describe("Maarif unit labels on screen", () => {
  it("no 9th/10th/11th-grade unit label is left in ALL CAPS", () => {
    const labels = [
      ...MAARIF9_COURSES,
      ...MAARIF10_COURSES,
      ...MAARIF9_GENEL_DENEME_SUBJECTS,
      ...MAARIF10_GENEL_DENEME_SUBJECTS,
      ...MAARIF11_COURSES,
    ].flatMap((c) => c.units.flatMap((u) => (u.unit ? [u.unit] : [])));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).not.toMatch(/\p{Lu}{3,}/u);
  });
});
