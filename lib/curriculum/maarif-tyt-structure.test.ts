import { describe, expect, it } from "vitest";

import { findCourseById } from "./index";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { buildDenemeMapping, DENEME_OTHER_LABEL, denemeRowsFor, maarifTytDenemeMappingFor } from "./maarif-tyt-deneme-mapping";
import { alignedUnits, resolveSpec, SUBJECT_SPECS } from "./maarif-tyt-structure";
import { maarifSelectionNodes } from "./maarif-selection";
import { flattenSelectionRows } from "./rows";

const tarih = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-tarih")!;
const mapping = maarifTytDenemeMappingFor("maarif-tyt-tarih")!;
const raw9 = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-tarih")!;
const raw10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-tarih")!;
const rawIds = [...raw9.units, ...raw10.units].flatMap((u) => u.topics.map((t) => t.id));
const bucketLabels = mapping.units.map((u) => [u.label, u.buckets.map((b) => b.label)]);

describe("Tarih structure", () => {
  it("has the coach's 6 units and their buckets, in order", () => {
    expect(bucketLabels).toEqual([
      ["1. Ünite: Geçmişin İnşa Sürecinde Tarih", ["Tarih Öğrenmenin Faydaları", "Tarihin Doğası", "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm"]],
      [
        "2. Ünite: Eski Çağ Medeniyetleri",
        ["Tarım Devrimi'nin Eski Çağ'a Etkileri", "Eski Çağ'da Yönetenler ve Savaşanlar", "Eski Çağ'da Hukuk", "Eski Çağ'da İnanç, Bilim ve Sanat", "Türklerde Konargöçer Yaşam"],
      ],
      [
        "3. Ünite: Orta Çağ Medeniyetleri",
        ["Orta Çağ'daki Kitlesel Göçler ve Avrupa Hun Devleti", "Orta Çağ'daki Siyasi ve Askeri Gelişmeler", "Orta Çağ'da Ticaret Yolları", "Orta Çağ'da Bilim, Kültür ve Sanat"],
      ],
      [
        "4. Ünite: Türkistan'dan Türkiye'ye (1040-1299)",
        [
          "Önemli Askeri Mücadelelerin Türk Tarihinin Seyrine Etkileri",
          "Türkistan'dan Türkiye'ye Türklerde Devlet ve Ordu Teşkilatları",
          "Türklerde Sosyoekonomik Hayat ve Şehirleşme",
          "Türk-İslam Medeniyetinde Bilim, Kültür, Eğitim ve Sanat",
        ],
      ],
      [
        "5. Ünite: Beylikten Devlete Osmanlı (1299 - 1453)",
        [
          "Osmanlı Devleti'nin Kuruluşuna Dair Görüşler",
          "Beylikten Devlete Siyasi ve Askerî Gelişmeler",
          "Osmanlı Devleti'nin İskân ve İstimâlet Politikası",
          "Osmanlı Devleti'nde Ordu, Hukuk ve Toprak Sistemi",
        ],
      ],
      [
        "6. Ünite: Cihan Devleti Osmanlı (1453 - 1683)",
        [
          "Osmanlı Devleti'nin Cihan Devleti Hâline Gelmesi",
          "Osmanlı Devleti'nin Yönetim ve Ordu Yapısında Değişim",
          "Avrupalıların Sömürgeci Politikaları",
          "Osmanlı Devleti'nde İsyanlar",
          "Osmanlı Devleti'nde Bilim, Kültür, Eğitim ve Sanat",
        ],
      ],
    ]);
  });

  it("resolves every spec entry against the real 9th/10th topics", () => {
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-tarih"]).unresolved).toEqual([]);
    expect(mapping.unresolved).toEqual([]);
  });

  it("rolls the right grade's topics into each bucket", () => {
    const bucket = (label: string) => mapping.units.flatMap((u) => u.buckets).find((b) => b.label === label)!.topicIds;
    // 9th grade's two topics about historical knowledge and digitalisation form ONE bucket.
    expect(bucket("Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm")).toEqual(["maarif9-tarih-u0-t2", "maarif9-tarih-u0-t3"]);
    expect(bucket("Tarihin Doğası")).toEqual(["maarif9-tarih-u0-t1"]);
    expect(bucket("Türklerde Konargöçer Yaşam")).toEqual(["maarif9-tarih-u1-t4"]);
    expect(bucket("Önemli Askeri Mücadelelerin Türk Tarihinin Seyrine Etkileri")).toEqual(["maarif10-tarih-u0-t0"]);
    // The coach's order puts İskân ve İstimâlet before Ordu/Hukuk/Toprak (raw topics 4 and 3).
    expect(bucket("Osmanlı Devleti'nin İskân ve İstimâlet Politikası")).toEqual(["maarif10-tarih-u1-t3"]);
    expect(bucket("Osmanlı Devleti'nde Ordu, Hukuk ve Toprak Sistemi")).toEqual(["maarif10-tarih-u1-t2"]);
    expect(bucket("Osmanlı Devleti'nde Bilim, Kültür, Eğitim ve Sanat")).toEqual(["maarif10-tarih-u2-t4"]);
  });

  it("keeps the one topic no bucket claims in the Diğer row -- nothing is lost or counted twice", () => {
    const claimed = mapping.units.flatMap((u) => u.buckets.flatMap((b) => b.topicIds));
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(mapping.otherTopicIds).toEqual(["maarif10-tarih-u1-t4"]); // Osmanlı Devleti'nin İlim ve İrfan Geleneği
    expect([...claimed, ...mapping.otherTopicIds].sort()).toEqual(rawIds.slice().sort());
    const rows = denemeRowsFor(mapping);
    expect(rows).toHaveLength(25 + 1); // 25 buckets + the Diğer row
    expect(rows[rows.length - 1]).toMatchObject({ label: DENEME_OTHER_LABEL, memberTopicIds: ["maarif10-tarih-u1-t4"] });
    expect(rows.slice(0, -1).map((r) => r.unitRowSpan)).toEqual([3, null, null, 5, null, null, null, null, 4, null, null, null, 4, null, null, null, 4, null, null, null, 5, null, null, null, null]);
  });

  it("an extra spec gap becomes a Diğer row too (the fallback is per subject)", () => {
    const partial = buildDenemeMapping(tarih, { units: SUBJECT_SPECS["maarif-tyt-tarih"].units.slice(0, 1) });
    expect(partial.otherTopicIds).toHaveLength(rawIds.length - 4);
  });
});

describe("Tarih in Kaynak Takibi (the merged Maarif TYT course)", () => {
  it("is laid out in the coach's six numbered units, with no per-grade tag", () => {
    const labels = [...new Set(tarih.units.map((u) => u.unit))];
    expect(labels).toEqual(mapping.units.map((u) => u.label));
    expect(tarih.units.some((u) => /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
  });

  it("keeps every raw 9th/10th Tarih topic id exactly once", () => {
    const ids = tarih.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(ids.slice().sort()).toEqual(rawIds.slice().sort());
    expect(findCourseById("maarif-tyt-tarih")).toBe(tarih);
  });

  it("gives each bucket its own tracking row, so cells align with the buckets", () => {
    const nodes = maarifSelectionNodes(tarih);
    // 26 buckets/entries: one node each (a one-topic bucket is a lone leaf named by the bucket).
    expect(nodes).toHaveLength(26);
    expect(nodes.find((n) => n.label === "Tarihin Doğası")).toMatchObject({ id: "maarif9-tarih-u0-t1", memberTopicIds: ["maarif9-tarih-u0-t1"], readOnlyNames: [] });
    // The two-topic bucket is a heading group over its two topics.
    const grouped = nodes.find((n) => n.label === "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm")!;
    expect(grouped.memberTopicIds).toEqual(["maarif9-tarih-u0-t2", "maarif9-tarih-u0-t3"]);
    expect(grouped.readOnlyNames).toEqual([
      "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm › Tarihsel Bilginin Üretim Süreci",
      "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm › Tarih Araştırma ve Yazımında Dijital Dönüşüm",
    ]);
  });

  it("shares one merged Ünite cell across a unit's buckets", () => {
    const rows = flattenSelectionRows(tarih);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([3, 5, 4, 4, 5, 5]);
  });

  it("keeps the topic no bucket names, as its own entry at the end of its unit", () => {
    const unit5 = tarih.units.filter((u) => u.unit.startsWith("5. Ünite"));
    expect(unit5).toHaveLength(5);
    expect(unit5[4].topics).toEqual([{ id: "maarif10-tarih-u1-t4", name: "Osmanlı Devleti'nin İlim ve İrfan Geleneği" }]);
  });
});

describe("what stays untouched", () => {
  it("the 9th and 10th graders' own Tarih courses keep their grade-and-unit structure", () => {
    expect(raw9.units.map((u) => u.topics.length)).toEqual([4, 5, 4]);
    expect(raw10.units.map((u) => u.topics.length)).toEqual([4, 5, 5]);
    expect(raw9.units[0].unit).toBe("1. Ünite: Geçmişin İnşa Sürecinde Tarih");
    expect(raw10.units[0].unit).toBe("1. Ünite: Türkistan'dan Türkiye'ye");
    expect(findCourseById("maarif9-tarih")).toBe(raw9);
  });

  it("the 11th grade's own Tarih (the 11. Sınıf tab) is a different course and is unchanged", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-tarih")!;
    expect(own.units.map((u) => u.unit)).toEqual([
      "1. Ünite: Değişen Dünyada Osmanlı (1683-1789)",
      "2. Ünite: Dönüşüm Sürecinde Osmanlı (1789-1908)",
      "3. Ünite: Savaşlar Sarmalında Osmanlı (1908-1918)",
    ]);
  });

  it("the other merged subjects are still 9th's units followed by 10th's, grade-tagged", () => {
    const mat = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-matematik")!;
    expect(mat.units.every((u) => /^\((9|10)\. Sınıf\) /.test(u.unit))).toBe(true);
    expect(alignedUnits.length).toBeGreaterThan(0);
  });
});
