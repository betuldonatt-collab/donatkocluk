import { describe, expect, it } from "vitest";

import {
  buildDenemeMapping,
  DENEME_OTHER_LABEL,
  denemeRowsFor,
  MAARIF_TYT_DENEME_MAPPED_COURSE_IDS,
  maarifTytDenemeMappingFor,
} from "./maarif-tyt-deneme-mapping";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";

const cografya = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-cografya")!;
const mapping = maarifTytDenemeMappingFor("maarif-tyt-cografya")!;
const allIds = cografya.units.flatMap((u) => u.topics.map((t) => t.id));
const bucket = (label: string) => mapping.units.flatMap((u) => u.buckets).find((b) => b.label === label)!.topicIds;

describe("Coğrafya deneme mapping", () => {
  it("has the coach's 7 units with two buckets each, in order", () => {
    expect(mapping.units.map((u) => [u.label, u.buckets.map((b) => b.label)])).toEqual([
      ["1. Ünite: Coğrafyanın Doğası", ["Coğrafya Bilimi", "Coğrafi Bakış"]],
      ["2. Ünite: Mekânsal Bilgi Teknolojileri", ["Harita Okuryazarlığı", "Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları"]],
      ["3. Ünite: Doğal Sistemler ve Süreçler", ["İklim Sistemi", "Yeryüzünün Şekillenmesi"]],
      ["4. Ünite: Beşerî Sistemler ve Süreçler", ["Nüfus Dinamikleri", "Yerleşme"]],
      ["5. Ünite: Ekonomik Faaliyetler ve Etkileri", ["Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", "Ekonomik Faaliyetler ve Sektörel Yapı"]],
      ["6. Ünite: Afetler ve Sürdürülebilir Çevre", ["Afetler", "Afetlerle Mücadele"]],
      ["7. Ünite: Bölgeler, Ülkeler ve Küresel Bağlantılar", ["Bölge ve Bölge Sınırı", "Türk Kültürünün Mekânsal Özellikleri"]],
    ]);
  });

  it("claims every raw 9th/10th topic exactly once -- nothing lost, nothing counted twice", () => {
    const claimed = mapping.units.flatMap((u) => u.buckets.flatMap((b) => b.topicIds));
    expect(claimed.slice().sort()).toEqual(allIds.slice().sort());
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(allIds).toHaveLength(40); // 22 (9th) + 18 (10th)
    expect(mapping.unresolved).toEqual([]);
    expect(mapping.otherTopicIds).toEqual([]);
  });

  it("rolls each bucket up from the right grade's topics", () => {
    expect(bucket("Coğrafya Bilimi")).toHaveLength(3);
    expect(bucket("Coğrafya Bilimi").every((id) => id.startsWith("maarif9-cografya"))).toBe(true);
    expect(bucket("Coğrafi Bakış")).toEqual(["maarif10-cografya-u0-t0"]);
    expect(bucket("İklim Sistemi")).toHaveLength(4);
    expect(bucket("Yeryüzünün Şekillenmesi")).toHaveLength(5);
    expect(bucket("Yeryüzünün Şekillenmesi").every((id) => id.startsWith("maarif10-cografya"))).toBe(true);
  });

  it("splits 9th grade's Harita Okuryazarlığı group across the two Mekânsal Bilgi buckets", () => {
    expect(bucket("Harita Okuryazarlığı")).toEqual(["maarif9-cografya-u1-t0", "maarif9-cografya-u1-t1"]);
    expect(bucket("Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları")).toEqual([
      "maarif9-cografya-u1-t2",
      "maarif10-cografya-u1-t0",
      "maarif10-cografya-u1-t1",
    ]);
  });

  it("only ever reads topics that exist in the untouched 9th/10th data", () => {
    const real = new Set([...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES].flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.id))));
    for (const id of mapping.units.flatMap((u) => u.buckets.flatMap((b) => b.topicIds))) expect(real.has(id)).toBe(true);
  });
});

describe("maarifTytDenemeMappingFor", () => {
  it("exists only for subjects that have a mapping; every other course keeps its plain table", () => {
    expect(MAARIF_TYT_DENEME_MAPPED_COURSE_IDS).toEqual(["maarif-tyt-cografya", "maarif-tyt-tarih"]);
    expect(maarifTytDenemeMappingFor("maarif-tyt-matematik")).toBeNull();
    expect(maarifTytDenemeMappingFor("maarif9-cografya")).toBeNull(); // 9th/10th graders keep their own analysis
    expect(maarifTytDenemeMappingFor("maarif11-cografya")).toBeNull();
    expect(maarifTytDenemeMappingFor("tyt-cografya")).toBeNull();
  });
});

describe("denemeRowsFor", () => {
  it("gives one row per bucket with each unit's first row carrying its span, and no Diğer row when nothing is left over", () => {
    const rows = denemeRowsFor(mapping);
    expect(rows).toHaveLength(14);
    expect(rows.map((r) => r.unitRowSpan)).toEqual([2, null, 2, null, 2, null, 2, null, 2, null, 2, null, 2, null]);
    expect(rows.some((r) => r.label === DENEME_OTHER_LABEL)).toBe(false);
    expect(rows[0]).toMatchObject({ label: "Coğrafya Bilimi", unitLabel: "1. Ünite: Coğrafyanın Doğası" });
  });
});

describe("Diğer fallback", () => {
  const partialSpec = {
    units: [{ label: "1. Ünite: Coğrafyanın Doğası", buckets: [{ label: "Coğrafya Bilimi", from: [{ course: "maarif9-cografya", unit: 1 }] }] }],
  };

  it("collects every raw topic no bucket claims into a per-subject Diğer row", () => {
    const partial = buildDenemeMapping(cografya, partialSpec);
    expect(partial.otherTopicIds).toHaveLength(37); // 40 topics, 3 claimed
    const rows = denemeRowsFor(partial);
    const other = rows[rows.length - 1];
    expect(other).toMatchObject({ label: DENEME_OTHER_LABEL, unitRowSpan: 1 });
    expect(other.memberTopicIds).toEqual(partial.otherTopicIds);
  });

  it("a bucket never steals a topic an earlier bucket already claimed", () => {
    const dup = buildDenemeMapping(cografya, {
      units: [
        {
          label: "U",
          buckets: [
            { label: "A", from: [{ course: "maarif9-cografya", unit: 1 }] },
            { label: "B", from: [{ course: "maarif9-cografya", unit: 1 }] },
          ],
        },
      ],
    });
    expect(dup.units[0].buckets[0].topicIds).toHaveLength(3);
    expect(dup.units[0].buckets[1].topicIds).toEqual([]);
  });

  it("reports a spec entry that matches nothing instead of throwing", () => {
    const bad = buildDenemeMapping(cografya, {
      units: [
        {
          label: "U",
          buckets: [{ label: "A", from: [{ course: "maarif9-cografya", unit: 99 }, { course: "maarif9-cografya", unit: 1, topics: ["No Such Topic"] }] }],
        },
      ],
    });
    expect(bad.unresolved).toHaveLength(2);
    expect(bad.units[0].buckets[0].topicIds).toEqual([]);
  });
});
