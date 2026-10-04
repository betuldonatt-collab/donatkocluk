import { describe, expect, it } from "vitest";

import { findCourseById } from "./index";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { alignedUnits, hasBucketedStructure, resolveSpec, SUBJECT_SPECS } from "./maarif-tyt-structure";
import { courseHasBuckets, maarifSelectionNodes } from "./maarif-selection";
import { flattenSelectionRows } from "./rows";

const merged = (id: string) => MAARIF_TYT_MERGED_COURSES.find((c) => c.id === id)!;
const tarih = merged("maarif-tyt-tarih");
const cografya = merged("maarif-tyt-cografya");
const raw = (prefix: string) =>
  [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES]
    .filter((c) => c.id.startsWith(prefix))
    .flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.id)));
const rawTarih = raw("maarif9-tarih").concat(raw("maarif10-tarih"));
const rawCografya = raw("maarif9-cografya").concat(raw("maarif10-cografya"));
const biyoloji = merged("maarif-tyt-biyoloji");
const rawBiyoloji = raw("maarif9-biyoloji").concat(raw("maarif10-biyoloji"));

// What the UI is allowed to show: unit label + bucket label per row.
const unitsAndBuckets = (courseId: string) => {
  const out: [string, string[]][] = [];
  for (const row of flattenSelectionRows(merged(courseId))) {
    const last = out[out.length - 1];
    if (last && last[0] === row.unitLabel) last[1].push(row.label);
    else out.push([row.unitLabel, [row.label]]);
  }
  return out;
};

describe("Tarih: the buckets are the only thing shown", () => {
  it("has the coach's 6 units and their buckets, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-tarih")).toEqual([
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
          "Osmanlı Devleti'nin İlim ve İrfan Geleneği",
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

  it("shows exactly 26 rows: every row is a bucket leaf with nothing listed beneath it", () => {
    const rows = flattenSelectionRows(tarih);
    expect(rows).toHaveLength(26);
    expect(rows.every((r) => r.readOnlyNames.length === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes(" › "))).toBe(false);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([3, 5, 4, 4, 5, 5]);
    expect(courseHasBuckets(tarih)).toBe(true);
    expect(tarih.units.every((u) => u.bucket !== undefined)).toBe(true);
  });

  it("resolves every spec entry and claims every raw topic exactly once (nothing left for Diğer)", () => {
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-tarih"]).unresolved).toEqual([]);
    const ids = tarih.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(ids.slice().sort()).toEqual(rawTarih.slice().sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(rawTarih).toHaveLength(27); // 13 (9th) + 14 (10th)
    expect(tarih.units.some((u) => u.unit === "Diğer")).toBe(false);
    expect(findCourseById("maarif-tyt-tarih")).toBe(tarih);
  });

  it("hides the raw topics behind each bucket but keeps their real ids as members", () => {
    const node = (label: string) => maarifSelectionNodes(tarih).find((n) => n.label === label)!;
    // Two raw topics, ONE leaf: saved against the first, read from both.
    expect(node("Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm")).toMatchObject({
      id: "maarif9-tarih-u0-t2",
      memberTopicIds: ["maarif9-tarih-u0-t2", "maarif9-tarih-u0-t3"],
      readOnlyNames: [],
    });
    expect(node("Tarihin Doğası")).toMatchObject({ id: "maarif9-tarih-u0-t1", memberTopicIds: ["maarif9-tarih-u0-t1"], readOnlyNames: [] });
    expect(node("Osmanlı Devleti'nin İskân ve İstimâlet Politikası").memberTopicIds).toEqual(["maarif10-tarih-u1-t3"]);
    expect(node("Osmanlı Devleti'nin İlim ve İrfan Geleneği").memberTopicIds).toEqual(["maarif10-tarih-u1-t4"]);
  });

  it("is laid out with no per-grade tag", () => {
    expect(tarih.units.some((u) => /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
  });
});

describe("Coğrafya: the buckets are the only thing shown", () => {
  it("has the coach's 7 units with two buckets each, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-cografya")).toEqual([
      ["1. Ünite: Coğrafyanın Doğası", ["Coğrafya Bilimi", "Coğrafi Bakış"]],
      ["2. Ünite: Mekânsal Bilgi Teknolojileri", ["Harita Okuryazarlığı", "Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları"]],
      ["3. Ünite: Doğal Sistemler ve Süreçler", ["İklim Sistemi", "Yeryüzünün Şekillenmesi"]],
      ["4. Ünite: Beşerî Sistemler ve Süreçler", ["Nüfus Dinamikleri", "Yerleşme"]],
      ["5. Ünite: Ekonomik Faaliyetler ve Etkileri", ["Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", "Ekonomik Faaliyetler ve Sektörel Yapı"]],
      ["6. Ünite: Afetler ve Sürdürülebilir Çevre", ["Afetler", "Afetlerle Mücadele"]],
      ["7. Ünite: Bölgeler, Ülkeler ve Küresel Bağlantılar", ["Bölge ve Bölge Sınırı", "Türk Kültürünün Mekânsal Özellikleri"]],
    ]);
  });

  it("shows 14 leaf rows and keeps all 40 raw topics as hidden members, each once", () => {
    const rows = flattenSelectionRows(cografya);
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.readOnlyNames.length === 0)).toBe(true);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-cografya"]).unresolved).toEqual([]);
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(rawCografya).toHaveLength(40); // 22 (9th) + 18 (10th)
    expect(ids.slice().sort()).toEqual(rawCografya.slice().sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rolls each bucket up from the right grade's topics", () => {
    const members = (label: string) => flattenSelectionRows(cografya).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Coğrafya Bilimi")).toHaveLength(3);
    expect(members("Coğrafi Bakış")).toEqual(["maarif10-cografya-u0-t0"]);
    expect(members("Harita Okuryazarlığı")).toEqual(["maarif9-cografya-u1-t0", "maarif9-cografya-u1-t1"]);
    expect(members("Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları")).toEqual([
      "maarif9-cografya-u1-t2",
      "maarif10-cografya-u1-t0",
      "maarif10-cografya-u1-t1",
    ]);
    expect(members("Yeryüzünün Şekillenmesi").every((id) => id.startsWith("maarif10-cografya"))).toBe(true);
  });
});

describe("Biyoloji: the buckets are the only thing shown", () => {
  it("has the coach's 4 themes and their buckets, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-biyoloji")).toEqual([
      [
        "1. Tema: Yaşam",
        [
          "Biyoloji Bilimi ve Bilimsel Araştırma Süreçleri",
          "Canlıların Ortak Özellikleri",
          "Virüsler",
          "Canlıların Sınıflandırılması",
          "Bakteri ve Arke Âlemleri",
          "Protista ve Bitki Âlemleri",
          "Mantarlar Âlemi",
          "Omurgasız Hayvanlar",
          "Omurgalı Hayvanlar ve Biyoçeşitlilik",
        ],
      ],
      [
        "2. Tema: Organizasyon",
        [
          "İnorganik Moleküller",
          "Karbohidratlar",
          "Lipitler",
          "Proteinler",
          "Enzimler",
          "Nükleik Asitler",
          "Vitaminler",
          "Hücre ve Alt Birimleri - I",
          "Hücre ve Alt Birimleri - II",
          "Difüzyon ve Ozmoz",
          "Aktif Taşıma, Endositoz ve Ekzositoz",
        ],
      ],
      [
        "3. Tema: Enerji",
        [
          "Enerji Molekülü ATP",
          "Fotosentez Reaksiyonları",
          "Fotosentez Hızını Etkileyen Faktörler ve Kemosentez",
          "Canlılarda Sindirim",
          "İnsanda Sindirim",
          "Oksijenli Solunum",
          "Fermantasyon ve Beslenme",
        ],
      ],
      [
        "4. Tema: Ekoloji",
        [
          "Ekosistemin Bileşenleri",
          "Komünite ve Popülasyon Ekolojisi",
          "Ekosistemde Madde ve Enerji Akışı",
          "Madde Döngüleri",
          "Ekolojik Sürdürülebilirlik",
        ],
      ],
    ]);
  });

  it("shows only bucket leaves and keeps all 62 raw 9th/10th topics as hidden members, each exactly once", () => {
    const rows = flattenSelectionRows(biyoloji);
    expect(rows).toHaveLength(32);
    expect(rows.every((r) => r.readOnlyNames.length === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes(" › "))).toBe(false);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([9, 11, 7, 5]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-biyoloji"]).unresolved).toEqual([]);
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(rawBiyoloji).toHaveLength(62); // 27 + 16 (9th) + 10 + 9 (10th)
    expect(ids.slice().sort()).toEqual(rawBiyoloji.slice().sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(biyoloji.units.some((u) => u.unit === "Diğer")).toBe(false);
    expect(biyoloji.units.some((u) => /^(d+. Sınıf)/.test(u.unit))).toBe(false);
  });

  it("rolls the raw topics into the right grade's buckets", () => {
    const members = (label: string) => flattenSelectionRows(biyoloji).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Canlıların Ortak Özellikleri")).toHaveLength(11);
    expect(members("Virüsler")).toEqual(["maarif9-biyoloji-u0-t14"]);
    expect(members("Bakteri ve Arke Âlemleri")).toEqual(["maarif9-biyoloji-u0-t16", "maarif9-biyoloji-u0-t17"]);
    expect(members("Vitaminler")).toEqual(["maarif9-biyoloji-u1-t7", "maarif9-biyoloji-u1-t8"]);
    expect(members("Difüzyon ve Ozmoz")).toEqual(["maarif9-biyoloji-u1-t14"]);
    expect(members("Aktif Taşıma, Endositoz ve Ekzositoz")).toEqual(["maarif9-biyoloji-u1-t13"]);
    expect(members("Fotosentez Reaksiyonları")).toEqual(["maarif10-biyoloji-u0-t1", "maarif10-biyoloji-u0-t2"]);
    expect(members("Ekolojik Sürdürülebilirlik")).toHaveLength(5);
    expect(members("Ekolojik Sürdürülebilirlik").every((id) => id.startsWith("maarif10-biyoloji-u1"))).toBe(true);
  });

  it("the 11th grade's own Biyoloji (the 11. Sınıf tab) is untouched", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-biyoloji")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.units.map((u) => u.unit)).toEqual(["1. Ünite: Tepki", "2. Ünite: Homeostazi"]);
    expect(own.units.map((u) => u.topics.length)).toEqual([16, 10]);
  });
});

describe("a topic no bucket claims is kept as a leaf of its own", () => {
  it("stays in its unit (named by itself); units no spec unit uses go under Diğer", () => {
    const partial = alignedUnits({
      units: [{ label: "U1", buckets: [{ label: "Only this", from: [{ course: "maarif10-tarih", unit: 2, topics: [1] }] }] }],
    });
    expect(partial.every((u) => u.bucket !== undefined)).toBe(true);
    const ids = partial.flatMap((u) => u.topics.map((t) => t.id));
    expect(ids.slice().sort()).toEqual(raw("maarif10-tarih").slice().sort());
    expect(partial.filter((u) => u.unit === "U1").flatMap((u) => u.topics.map((t) => t.id))).toEqual([
      "maarif10-tarih-u1-t0",
      "maarif10-tarih-u1-t1",
      "maarif10-tarih-u1-t2",
      "maarif10-tarih-u1-t3",
      "maarif10-tarih-u1-t4",
    ]);
    expect(partial.filter((u) => u.unit === "Diğer")).toHaveLength(9);
  });

  it("a bucket never steals a topic an earlier bucket already claimed", () => {
    const dup = resolveSpec({
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
    expect(dup.units[0].buckets[0].topics).toHaveLength(3);
    expect(dup.units[0].buckets[1].topics).toEqual([]);
  });

  it("reports a spec entry that matches nothing instead of throwing", () => {
    const bad = resolveSpec({
      units: [{ label: "U", buckets: [{ label: "A", from: [{ course: "maarif9-cografya", unit: 99 }, { course: "maarif9-cografya", unit: 1, topics: ["No Such Topic"] }] }] }],
    });
    expect(bad.unresolved).toHaveLength(2);
  });
});

describe("only the subjects with a spec are bucketed", () => {
  it("Coğrafya and Tarih yes; every other merged subject keeps 9th's units then 10th's, grade-tagged", () => {
    expect(Object.keys(SUBJECT_SPECS)).toEqual(["maarif-tyt-cografya", "maarif-tyt-tarih", "maarif-tyt-biyoloji"]);
    expect(hasBucketedStructure("maarif-tyt-biyoloji")).toBe(true);
    expect(hasBucketedStructure("maarif11-biyoloji")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-tarih")).toBe(true);
    expect(hasBucketedStructure("maarif-tyt-matematik")).toBe(false);
    expect(hasBucketedStructure("maarif11-tarih")).toBe(false);
    expect(hasBucketedStructure("toString")).toBe(false);
    const mat = merged("maarif-tyt-matematik");
    expect(courseHasBuckets(mat)).toBe(false);
    expect(mat.units.every((u) => /^\((9|10)\. Sınıf\) /.test(u.unit))).toBe(true);
  });
});

describe("what stays untouched", () => {
  it("the 9th and 10th graders' own Tarih courses keep their grade-and-unit structure", () => {
    const raw9 = MAARIF9_KAYNAK_COURSES.find((c) => c.id === "maarif9-tarih")!;
    const raw10 = MAARIF10_KAYNAK_COURSES.find((c) => c.id === "maarif10-tarih")!;
    expect(raw9.units.map((u) => u.topics.length)).toEqual([4, 5, 4]);
    expect(raw10.units.map((u) => u.topics.length)).toEqual([4, 5, 5]);
    expect(courseHasBuckets(raw9)).toBe(false);
    expect(courseHasBuckets(raw10)).toBe(false);
    expect(findCourseById("maarif9-tarih")).toBe(raw9);
  });

  it("the 11th grade's own Tarih (the 11. Sınıf tab) is a different course and is unchanged", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-tarih")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.units.map((u) => u.unit)).toEqual([
      "1. Ünite: Değişen Dünyada Osmanlı (1683-1789)",
      "2. Ünite: Dönüşüm Sürecinde Osmanlı (1789-1908)",
      "3. Ünite: Savaşlar Sarmalında Osmanlı (1908-1918)",
    ]);
  });
});
