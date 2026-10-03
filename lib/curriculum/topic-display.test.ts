import { describe, expect, it } from "vitest";

import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { coreTopicTitle, topicLinesForUnit } from "./topic-display";

const t = (id: string, name: string) => ({ id, name });

describe("coreTopicTitle", () => {
  it("cuts the words a topic repeats from its heading (3+ shared opening words)", () => {
    expect(coreTopicTitle("Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", "Ekonomik Faaliyetleri Etkileyen Doğal Faktörler")).toBe("Doğal Faktörler");
    expect(
      coreTopicTitle(
        "Farklı Canlıların Uyaranlara Karşı Oluşturduğu Tepki Mekanizmaları",
        "Farklı Canlıların Uyaranlara Karşı Oluşturduğu Tepkiler",
      ),
    ).toBe("Tepkiler");
  });

  it("leaves a topic alone when only 1-2 opening words repeat (it would become a fragment)", () => {
    expect(coreTopicTitle("Serbest Düşme", "Serbest Düşme Hareketi İle İlgili Veriler")).toBe("Serbest Düşme Hareketi İle İlgili Veriler");
    expect(coreTopicTitle("Coğrafya Bilimi", "Coğrafya Biliminin Konusu ve Bölümleri")).toBe("Coğrafya Biliminin Konusu ve Bölümleri");
    expect(coreTopicTitle("Manyetik Alan ve Manyetik Kuvvet", "Manyetik Alan")).toBe("Manyetik Alan");
  });

  it("never leaves nothing, or a title that starts with a connector", () => {
    expect(coreTopicTitle("Bir İki Üç", "Bir İki Üç")).toBe("Bir İki Üç");
    expect(coreTopicTitle("Bir İki Üç Dört", "Bir İki Üç ve Beş")).toBe("Bir İki Üç ve Beş");
  });

  it("ignores case and punctuation when comparing words, and capitalises with Turkish rules", () => {
    expect(coreTopicTitle("Su Kaynakları Ve Özellikleri", "su kaynakları, ve özellikleri: ılıman iklimler")).toBe("Ilıman iklimler");
  });
});

describe("topicLinesForUnit", () => {
  it("writes a shared heading once, with its topics on lines of their own beneath it", () => {
    const lines = topicLinesForUnit([
      t("a", "Coğrafya Bilimi › Coğrafya Biliminin Konusu ve Bölümleri"),
      t("b", "Coğrafya Bilimi › Niçin Coğrafya Öğrenmeliyiz?"),
    ]);
    expect(lines).toEqual([
      { kind: "heading", text: "Coğrafya Bilimi", depth: 0 },
      { kind: "topic", topicId: "a", text: "Coğrafya Biliminin Konusu ve Bölümleri", depth: 1 },
      { kind: "topic", topicId: "b", text: "Niçin Coğrafya Öğrenmeliyiz?", depth: 1 },
    ]);
  });

  it("starts a new heading when the heading changes", () => {
    const lines = topicLinesForUnit([t("a", "A › x"), t("b", "A › y"), t("c", "B › z")]);
    expect(lines.map((l) => (l.kind === "heading" ? `H:${l.text}` : `T:${l.text}`))).toEqual(["H:A", "T:x", "T:y", "H:B", "T:z"]);
  });

  it("a topic with no heading is a plain line at depth 0, and resets the heading", () => {
    const lines = topicLinesForUnit([t("a", "Edebiyat ve Dil"), t("b", "Şiir › Şiirin özellikleri"), t("c", "Anı"), t("d", "Şiir › Şiirde anlam")]);
    expect(lines.map((l) => `${l.kind}:${l.depth}:${l.text}`)).toEqual([
      "topic:0:Edebiyat ve Dil",
      "heading:0:Şiir",
      "topic:1:Şiirin özellikleri",
      "topic:0:Anı",
      "heading:0:Şiir",
      "topic:1:Şiirde anlam",
    ]);
  });

  it("nests deeper paths: each level is its own indented heading", () => {
    const lines = topicLinesForUnit([
      t("a", "Organik Moleküller › Vitaminler › Yağda Çözünen Vitaminler"),
      t("b", "Organik Moleküller › Vitaminler › Suda Çözünen Vitaminler"),
      t("c", "Organik Moleküller › Enzimler"),
    ]);
    expect(lines.map((l) => `${l.kind}:${l.depth}:${l.text}`)).toEqual([
      "heading:0:Organik Moleküller",
      "heading:1:Vitaminler",
      "topic:2:Yağda Çözünen Vitaminler",
      "topic:2:Suda Çözünen Vitaminler",
      "topic:1:Enzimler",
    ]);
  });

  it("returns nothing for a unit with no topics", () => {
    expect(topicLinesForUnit([])).toEqual([]);
  });
});

describe("9th grade Coğrafya, the cluttered case", () => {
  const cografya = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-cografya")!;
  const display = (unitIndex: number) =>
    topicLinesForUnit(cografya.units[unitIndex].topics).map((l) => `${l.kind === "heading" ? "# " : "  "}${l.text}`);

  it("shows each heading once with clean topics under it", () => {
    expect(display(0)).toEqual([
      "# Coğrafya Bilimi",
      "  Coğrafya Biliminin Konusu ve Bölümleri",
      "  Niçin Coğrafya Öğrenmeliyiz?",
      "  Coğrafya Biliminin Gelişimi",
    ]);
  });

  it("drops the words the economy unit's topics repeat from their heading", () => {
    expect(display(4)).toEqual(["# Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", "  Doğal Faktörler", "  Beşerî Faktörler"]);
  });
});

describe("every Maarif subject", () => {
  const all = [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES, ...MAARIF11_KAYNAK_COURSES, ...MAARIF_TYT_MERGED_COURSES];

  it("keeps every topic exactly once, in order, and never repeats a heading back to back", () => {
    for (const course of all) {
      for (const unit of course.units) {
        const lines = topicLinesForUnit(unit.topics);
        const topicIds = lines.flatMap((l) => (l.kind === "topic" ? [l.topicId] : []));
        expect(topicIds).toEqual(unit.topics.map((x) => x.id));
        lines.forEach((l, i) => {
          if (l.kind === "topic") expect(l.text.trim()).not.toBe("");
          const prev = lines[i - 1];
          if (l.kind === "heading" && prev?.kind === "heading") expect(l.depth).toBeGreaterThan(prev.depth);
        });
      }
    }
  });

  it("every topic line is a clean title: no ' › ' left inline", () => {
    for (const course of all) {
      for (const unit of course.units) {
        for (const l of topicLinesForUnit(unit.topics)) expect(l.text).not.toContain(" › ");
      }
    }
  });
});
