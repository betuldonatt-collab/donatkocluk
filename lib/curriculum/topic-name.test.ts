import { describe, expect, it } from "vitest";

import { MAARIF9_COURSES, MAARIF9_GENEL_DENEME_SUBJECTS } from "./maarif9";
import { MAARIF10_COURSES, MAARIF10_GENEL_DENEME_SUBJECTS } from "./maarif10";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { stripTopicNumberPrefix, withCleanTopicNames } from "./topic-name";

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

describe("withCleanTopicNames", () => {
  it("cleans topic names but keeps ids, unit labels and course names untouched", () => {
    const [course] = withCleanTopicNames([
      { id: "c", name: "9. Sınıf Matematik", units: [{ unit: "TEMA 1", topics: [{ id: "t1", name: "1.2. Kümeler" }] }] },
    ]);
    expect(course.name).toBe("9. Sınıf Matematik");
    expect(course.units[0].unit).toBe("TEMA 1");
    expect(course.units[0].topics[0]).toEqual({ id: "t1", name: "Kümeler" });
  });
});

describe("Maarif data shows no numeric markers anywhere", () => {
  const marker = /(^|\s›\s)\d+(\.\d+)*\.?\s/;
  const allTopics = [
    ...MAARIF9_COURSES,
    ...MAARIF10_COURSES,
    ...MAARIF9_GENEL_DENEME_SUBJECTS,
    ...MAARIF10_GENEL_DENEME_SUBJECTS,
    ...MAARIF_TYT_MERGED_COURSES,
  ].flatMap((c) => c.units.flatMap((u) => u.topics));

  it("no topic name in any Maarif list starts a segment with a hierarchy number", () => {
    expect(allTopics.length).toBeGreaterThan(0);
    for (const t of allTopics) expect(t.name).not.toMatch(marker);
  });
});
