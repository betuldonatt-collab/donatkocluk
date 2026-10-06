import { describe, expect, it } from "vitest";

import { findCourseById, findTopicById } from "./index";
import { validatePipelineStep } from "../topic-pipeline";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { withoutUnitMasters } from "./topic-groups";
import { alignedUnits, hasBucketedStructure, resolveSpec, SUBJECT_SPECS } from "./maarif-tyt-structure";
import { courseHasBuckets, maarifSelectionNodes } from "./maarif-selection";
import { flattenSelectionRows, isFlatRows, withGroupHeadings } from "./rows";

// The merged course as its structure spec defines it: the generated "(Genel)" master topics (withUnitMasters) are checked
// on their own below, so every structure assertion here keeps describing the native buckets.
const merged = (id: string) => withoutUnitMasters(MAARIF_TYT_MERGED_COURSES.find((c) => c.id === id)!);
const tarih = merged("maarif-tyt-tarih");
const cografya = merged("maarif-tyt-cografya");
const raw = (prefix: string) =>
  [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES]
    .filter((c) => c.id.startsWith(prefix))
    .flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.id)));
const rawTarih = raw("maarif9-tarih").concat(raw("maarif10-tarih"));
const rawCografya = raw("maarif9-cografya").concat(raw("maarif10-cografya"));
const geometri = merged("maarif-tyt-geometri");
const matematik = merged("maarif-tyt-matematik");
const turkce = merged("maarif-tyt-turk-dili-ve-edebiyati");
const rawTurkce = raw("maarif9-turk-dili-ve-edebiyati").concat(raw("maarif10-turk-dili-ve-edebiyati"));
const rawMatematik = raw("maarif9-matematik").concat(raw("maarif10-matematik"));
const fizik = merged("maarif-tyt-fizik");
const rawFizik = raw("maarif9-fizik").concat(raw("maarif10-fizik"));
const kimya = merged("maarif-tyt-kimya");
const rawKimya = raw("maarif9-kimya").concat(raw("maarif10-kimya"));
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
    expect(findCourseById("maarif-tyt-tarih")).toBe(MAARIF_TYT_MERGED_COURSES.find((c) => c.id === "maarif-tyt-tarih"));
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

  it("shows only bucket leaves; the raw topics are hidden members, each exactly once, and only the 5 the list has no place for are left out", () => {
    const rows = flattenSelectionRows(biyoloji);
    expect(rows).toHaveLength(32);
    expect(rows.every((r) => r.readOnlyNames.length === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes(" › "))).toBe(false);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([9, 11, 7, 5]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-biyoloji"]).unresolved).toEqual([]);
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(rawBiyoloji).toHaveLength(62); // 27 + 16 (9th) + 10 + 9 (10th)
    const excludedIds = [
      "maarif9-biyoloji-u0-t18", // Ökaryotlar
      "maarif9-biyoloji-u0-t22", // Hayvanlar
      "maarif9-biyoloji-u1-t9", // Organik Moleküllerin Tayininde Kullanılan Ayıraçlar
      "maarif9-biyoloji-u1-t15", // Hücre, Doku, Organ ve Sistemlerin Organizasyonu
      "maarif10-biyoloji-u0-t9", // Enerji-Metabolizma İlişkisi
    ];
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-biyoloji"]).excluded.map((t) => t.id).sort()).toEqual(excludedIds.slice().sort());
    expect(ids).toHaveLength(57);
    expect(ids.slice().sort()).toEqual(rawBiyoloji.filter((id) => !excludedIds.includes(id)).sort());
    expect(new Set(ids).size).toBe(ids.length);
    // Dropped for good: not a bucket member, not a leaf of its own, not under Diğer.
    const everyId = biyoloji.units.flatMap((u) => u.topics.map((t) => t.id));
    for (const id of excludedIds) expect(everyId).not.toContain(id);
    expect(biyoloji.units.some((u) => u.unit === "Diğer")).toBe(false);
    expect(biyoloji.units.some((u) => /^(d+. Sınıf)/.test(u.unit))).toBe(false);
  });

  it("rolls the raw topics into the right grade's buckets", () => {
    const members = (label: string) => flattenSelectionRows(biyoloji).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Canlıların Ortak Özellikleri")).toHaveLength(11);
    expect(members("Virüsler")).toEqual(["maarif9-biyoloji-u0-t14"]);
    // The strictly-matching topics only: nothing unlisted was shoved in.
    expect(members("Canlıların Sınıflandırılması")).toEqual(["maarif9-biyoloji-u0-t15"]);
    expect(members("Omurgasız Hayvanlar")).toEqual(["maarif9-biyoloji-u0-t23"]);
    expect(members("Karbohidratlar")).toEqual(["maarif9-biyoloji-u1-t2"]);
    expect(members("Hücre ve Alt Birimleri - II")).toEqual(["maarif9-biyoloji-u1-t12"]);
    expect(members("Fermantasyon ve Beslenme")).toEqual(["maarif10-biyoloji-u0-t8"]);
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
    expect(own.units.map((u) => u.topics.length)).toEqual([17, 11]); // 16 + 10 native topics, plus each unit's "(Genel)" master
  });
});

describe("Türkçe: the flat list of 14 bölümler (no Ünite level), 7 of them virtual topics", () => {
  const P = "maarif-tyt-turkce-v-";
  const labels14 = [
    "Sözcük Anlamı",
    "Cümle Anlamı",
    "Anlatım Teknikleri",
    "Paragrafta Konu-Ana Düşünce",
    "Paragrafın Yapısı",
    "Paragrafta Yardımcı Düşünceler",
    "Sözcük Türleri",
    "Tamlamalar",
    "Fiil, Ek-Fiil",
    "Ekler",
    "Sözcük Yapısı",
    "Ses Bilgisi",
    "Yazım Kuralları",
    "Noktalama İşaretleri",
  ];

  it("is named Türkçe and shows EXACTLY the coach's 14 rows, in order, with no unit label", () => {
    expect(turkce.name).toBe("Türkçe");
    const rows = flattenSelectionRows(turkce);
    expect(rows.map((r) => r.label)).toEqual(labels14);
    expect(rows.every((r) => r.unitLabel === "" && r.groupLabel === undefined && r.readOnlyNames.length === 0)).toBe(true);
    expect(isFlatRows(rows)).toBe(true);
    expect(withGroupHeadings(rows).every((h) => h.kind === "row")).toBe(true);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-turk-dili-ve-edebiyati"]).unresolved).toEqual([]);
  });

  it("only the other subjects keep a unit column", () => {
    for (const c of [tarih, cografya, biyoloji, kimya, fizik, geometri, matematik]) expect(isFlatRows(flattenSelectionRows(c))).toBe(false);
  });

  it("the 7 bölümler without a raw topic each have their own virtual topic", () => {
    const rows = flattenSelectionRows(turkce);
    const virtual = rows.filter((r) => r.memberTopicIds.length === 1 && r.memberTopicIds[0].startsWith(P));
    expect(virtual.map((r) => r.label)).toEqual([
      "Sözcük Anlamı",
      "Cümle Anlamı",
      "Anlatım Teknikleri",
      "Paragrafın Yapısı",
      "Paragrafta Yardımcı Düşünceler",
      "Ekler",
      "Sözcük Yapısı",
    ]);
    const ids = virtual.map((r) => r.id);
    expect(new Set(ids).size).toBe(7);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(60); // the shortest topicId cap in the server actions (mistakes, tasks)
      expect(rawTurkce).not.toContain(id); // never collides with a raw id
    }
    // A virtual row saves against its own id, and that id is a real topic OF the course.
    const row = rows.find((r) => r.label === "Ekler")!;
    expect(row.id).toBe(P + "ekler");
    expect(findTopicById("maarif-tyt-turk-dili-ve-edebiyati", row.id)).toEqual({ id: row.id, name: "Ekler" });
    expect(findTopicById("maarif-tyt-turk-dili-ve-edebiyati", "no-such")).toBeNull();
  });

  it("a virtual topic passes the same server checks as a raw one (a 11th grader's Kaynak Takibi tick)", () => {
    const step = (topicId: string) => ({ courseId: "maarif-tyt-turk-dili-ve-edebiyati", topicId, step: "konu_calismasi" as const, value: true });
    expect(() => validatePipelineStep("YKS", step(P + "sozcuk-yapisi"), 11)).not.toThrow();
    expect(() => validatePipelineStep("YKS", step("maarif9-turk-dili-ve-edebiyati-u0-t3"), 11)).not.toThrow(); // a raw one, for comparison
    // ...and still refused for anyone else / for an id that is not in the course.
    expect(() => validatePipelineStep("YKS", step(P + "sozcuk-yapisi"), 9)).toThrow();
    expect(() => validatePipelineStep("YKS", step(P + "nope"), 11)).toThrow();
  });

  it("places 14 grammar/paragraph raw topics and excludes the other 34, each accounted for once", () => {
    const rows = flattenSelectionRows(turkce);
    const placedRaw = rows.flatMap((r) => r.memberTopicIds).filter((id) => !id.startsWith(P));
    expect(rawTurkce).toHaveLength(48); // 23 (9th) + 25 (10th)
    expect(placedRaw).toHaveLength(14);
    const excluded = resolveSpec(SUBJECT_SPECS["maarif-tyt-turk-dili-ve-edebiyati"]).excluded.map((t) => t.id);
    expect(excluded).toHaveLength(34);
    expect([...placedRaw, ...excluded].sort()).toEqual(rawTurkce.slice().sort());
    const everyId = turkce.units.flatMap((u) => u.topics.map((t) => t.id));
    for (const id of excluded) expect(everyId).not.toContain(id);
    expect(turkce.units.some((u) => u.unit === "Diğer" || /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
  });

  it("Fiilimsiler and Cümle Türleri are excluded, not merged into Fiil, Ek-Fiil / Cümle Anlamı", () => {
    const excluded = resolveSpec(SUBJECT_SPECS["maarif-tyt-turk-dili-ve-edebiyati"]).excluded.map((t) => t.id);
    expect(excluded).toContain("maarif10-turk-dili-ve-edebiyati-u2-t4"); // Fiilimsiler
    expect(excluded).toContain("maarif10-turk-dili-ve-edebiyati-u3-t6"); // Cümle Türleri
    const members = (label: string) => flattenSelectionRows(turkce).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Fiil, Ek-Fiil")).toEqual(["maarif10-turk-dili-ve-edebiyati-u2-t3"]); // Fiiller only
    expect(members("Cümle Anlamı")).toEqual([P + "cumle-anlami"]);
  });

  it("rolls the remaining grammar topics into the right bölüm", () => {
    const members = (label: string) => flattenSelectionRows(turkce).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Paragrafta Konu-Ana Düşünce")).toEqual(["maarif9-turk-dili-ve-edebiyati-u1-t5", "maarif9-turk-dili-ve-edebiyati-u1-t6"]);
    expect(members("Sözcük Türleri")).toHaveLength(5);
    expect(members("Tamlamalar")).toEqual(["maarif10-turk-dili-ve-edebiyati-u0-t5"]);
    expect(members("Yazım Kuralları")).toHaveLength(2);
    expect(members("Noktalama İşaretleri")).toHaveLength(2);
  });

  it("the 11th grade's own Türk Dili ve Edebiyatı (the 11. Sınıf tab) is untouched and has no virtual topics", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-turk-dili-ve-edebiyati")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.name).toBe("11. Sınıf Türk Dili ve Edebiyatı");
    expect(own.units[0].unit).toBe("1. Tema: Bir Diyeceğim Var!");
    expect(own.units.flatMap((u) => u.topics).some((t) => t.id.includes("-v-"))).toBe(false);
  });
});

describe("Matematik: the pure-math units, Tema -> Bölüm leaf", () => {
  const excludedId = "maarif9-matematik-u6-t1"; // Olayların Olasılığına İlişkin Tümevarımsal Akıl Yürütme

  it("has the coach's 8 temas and their bölümler, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-matematik")).toEqual([
      [
        "1. Tema: Sayılar",
        [
          "Gerçek Sayıların Üslü ve Köklü Gösterimleri ile Yapılan İşlemler",
          "Gerçek Sayı Aralıklarının Gösterimi ve Aralıklarla İlgili İşlemler",
          "Sayı Kümelerinin Özellikleri ve Gerçek Sayıların İşlem Özellikleri",
        ],
      ],
      [
        "2. Tema: Nicelikler ve Değişimler",
        [
          "Doğrusal Fonksiyonlar ve Nitel Özellikleri",
          "Mutlak Değer Fonksiyonları ve Nitel Özellikleri",
          "Doğrusal Fonksiyonlarla İfade Edilebilen Denklem ve Eşitsizlik Problemleri",
        ],
      ],
      [
        "3. Tema: Sayılar",
        [
          "Bir Doğal Sayı ile Asal Çarpanları ve Bölenleri Arasındaki İlişkiler",
          "En Büyük Ortak Bölen (EBOB) ve En Küçük Ortak Kat (EKOK)",
          "Bölünebilme Özelliklerini Kullanarak Kalan Bulma",
        ],
      ],
      [
        "4. Tema: Algoritma ve Bilişim",
        [
          "Algoritma Temelli Yaklaşımlarla Problem Çözme",
          "Algoritmik Yapılar İçerisindeki Mantık Bağlaçları ve Niceleyiciler",
          "Algoritmalarda ve Matematiksel İspatlarda Mantık Bağlaçları ve Niceleyiciler",
          "Cebirsel İşlemlerin Algoritmik Yapısı",
        ],
      ],
      [
        "5. Tema: Nicelikler ve Değişimler",
        [
          "Gerçek Sayılarda Tanımlı Fonksiyonların Nitel Özellikleri",
          "Gerçek Sayılarda Tanımlı Karesel Fonksiyonlar ve Nitel Özellikleri",
          "Gerçek Sayılarda Tanımlı Karekök Fonksiyonlar ve Nitel Özellikleri",
          "Gerçek Sayılarda Tanımlı Rasyonel Fonksiyonlar ve Nitel Özellikleri",
          "Doğrusal, Karesel, Karekök ve Rasyonel Referans Fonksiyonlar ile Bu Fonksiyonlardan Türetilebilen Fonksiyonların Ters Fonksiyonları",
          "Doğrusal, Karesel, Karekök ve Rasyonel Fonksiyonlardan Türetilebilen Eşitsizlikler ve Denklemler",
        ],
      ],
      [
        "6. Tema: İstatistiksel Araştırma Süreci",
        [
          "Tek Nicel Değişkenli Veri Dağılımları ile Çalışma ve Veriye Dayalı Karar Verme",
          "İki Kategorik Değişkenli Verilerle Çalışma, İlişkililik Analizi Yapma ve Yorumlama",
        ],
      ],
      ["7. Tema: Sayma", ["Sayma Stratejileri, Sayma Çeşitleri, Faktöriyel, Sıralama Sayısı, Seçme Sayısı, Pascal (Paskal) Üçgeni, Güvercin Yuvası İlkesi"]],
      ["8. Tema: Veriden Olasılığa", ["Olayların Olasılığını Gözleme Dayalı Tahmin Etme", "Koşullu Olasılık, Bayes Teoremi ve Uygulamaları"]],
    ]);
  });

  it("shows 24 leaf rows; 28 of the 29 pure-math raw topics are hidden members, 1 is excluded, and no geometry unit leaks in", () => {
    const rows = flattenSelectionRows(matematik);
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.readOnlyNames.length === 0 && r.groupLabel === undefined)).toBe(true);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([3, 3, 3, 4, 6, 2, 1, 2]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-matematik"]).unresolved).toEqual([]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-matematik"]).excluded.map((t) => t.id)).toEqual([excludedId]);
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(ids).toHaveLength(28);
    expect(new Set(ids).size).toBe(28);
    expect(ids).not.toContain(excludedId);
    expect(matematik.units.some((u) => u.unit === "Diğer" || /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
    // Nothing from the geometry units (9th unit 3 + 4, 10th unit 1 + 6) is in here.
    const geometryIds = geometri.units.flatMap((u) => u.topics.map((t) => t.id));
    for (const id of geometryIds) expect(ids).not.toContain(id);
  });

  it("keeps the merged buckets' raw topics as hidden members", () => {
    const members = (label: string) => flattenSelectionRows(matematik).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Gerçek Sayıların Üslü ve Köklü Gösterimleri ile Yapılan İşlemler")).toEqual(["maarif9-matematik-u0-t0"]);
    expect(members("Sayı Kümelerinin Özellikleri ve Gerçek Sayıların İşlem Özellikleri")).toEqual(["maarif9-matematik-u0-t2", "maarif9-matematik-u0-t3"]);
    expect(members("Cebirsel İşlemlerin Algoritmik Yapısı")).toEqual(["maarif10-matematik-u4-t1"]);
    expect(members("Koşullu Olasılık, Bayes Teoremi ve Uygulamaları")).toEqual(["maarif10-matematik-u6-t0", "maarif10-matematik-u6-t1"]);
    expect(members("Tek Nicel Değişkenli Veri Dağılımları ile Çalışma ve Veriye Dayalı Karar Verme")).toEqual(["maarif9-matematik-u5-t0", "maarif9-matematik-u5-t1"]);
  });

  it("the 11th grade's own Matematik (the 11. Sınıf tab) is untouched", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-matematik")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.units).toHaveLength(5);
  });
});

describe("Geometri: a separate course built from the Matematik courses' geometry units", () => {
  const excludedId = "maarif9-matematik-u3-t4"; // Eşlik ve Benzerlikle İlgili Problemler

  it("has the coach's 3 groups and their 11 leaf rows, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-geometri")).toEqual([
      [
        "1. Tema: Üçgenler (9. Sınıf)",
        ["Doğruda ve Üçgende Açılar, Üçgende Açı Kenar Bağıntıları", "Geometrik Dönüşümler", "Üçgende Eşlik", "Üçgenlerde Benzerlik", "Dik Üçgen"],
      ],
      [
        "1. Tema: Üçgenler (10. Sınıf)",
        ["Trigonometrik Oranlar ve Özdeşlikler", "Üçgende Açıortay, Kenarortay, Kenar Orta Dikme ve Yükseklik", "Üçgende Alan", "Sinüs ve Kosinüs Teoremleri"],
      ],
      ["2. Tema: Analitik İnceleme", ["Noktanın Analitik İncelenmesi", "Doğrunun Analitik İncelenmesi"]],
    ]);
    const rows = flattenSelectionRows(geometri);
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.readOnlyNames.length === 0 && r.groupLabel === undefined)).toBe(true);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([5, 4, 2]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-geometri"]).unresolved).toEqual([]);
  });

  it("claims 11 of the 12 raw geometry topics; the 12th is excluded and shown nowhere", () => {
    const ids = flattenSelectionRows(geometri).flatMap((r) => r.memberTopicIds);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-geometri"]).excluded.map((t) => t.id)).toEqual([excludedId]);
    expect(ids).not.toContain(excludedId);
    expect(matematik.units.flatMap((u) => u.topics.map((t) => t.id))).not.toContain(excludedId);
    expect(geometri.units.flatMap((u) => u.topics.map((t) => t.id))).not.toContain(excludedId);
  });

  it("keeps the merged buckets' raw topics as hidden members", () => {
    const members = (label: string) => flattenSelectionRows(geometri).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Doğruda ve Üçgende Açılar, Üçgende Açı Kenar Bağıntıları")).toEqual(["maarif9-matematik-u2-t0"]);
    expect(members("Üçgende Açıortay, Kenarortay, Kenar Orta Dikme ve Yükseklik")).toEqual(["maarif10-matematik-u0-t1"]);
    expect(members("Dik Üçgen")).toEqual(["maarif9-matematik-u3-t3"]);
    expect(members("Doğrunun Analitik İncelenmesi")).toEqual(["maarif10-matematik-u5-t1"]);
  });

  it("no overlap: Matematik and Geometri share no raw topic, and together they cover the Matematik courses minus the 2 excluded topics", () => {
    const mathIds = matematik.units.flatMap((u) => u.topics.map((t) => t.id));
    const geoIds = new Set(geometri.units.flatMap((u) => u.topics.map((t) => t.id)));
    for (const id of mathIds) expect(geoIds.has(id)).toBe(false);
    expect(mathIds.length + geoIds.size).toBe(rawMatematik.length - 2); // 29 + 11 of 42
    const labels = matematik.units.map((u) => u.unit);
    expect(labels.some((l) => /Geometrik Şekiller|Eşlik ve Benzerlik|Analitik İnceleme|Üçgenler/.test(l))).toBe(false);
  });

  it("the 11th grade's own Matematik (the 11. Sınıf tab) keeps its Geometrik Şekiller unit", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-matematik")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.units.some((u) => u.unit === "2. Ünite: Geometrik Şekiller")).toBe(true);
  });
});

describe("Fizik: Ünite -> Bölüm leaf (two levels, no groups)", () => {
  it("has the coach's 8 units and their bölümler, in order", () => {
    expect(unitsAndBuckets("maarif-tyt-fizik")).toEqual([
      ["1. Ünite: Fizik Bilimi ve Kariyer Keşfi", ["Fizik Bilimi ve Fiziğin Alt Dalları", "Fiziğe Yön Verenler ve Fizik Bilimi ile İlgili Kariyer Keşfi"]],
      ["2. Ünite: Kuvvet ve Hareket - 1", ["Fiziksel Niceliklerin Sınıflandırılması", "Vektörler", "Doğadaki Temel Kuvvetler", "Hareket ve Hareket Türleri"]],
      ["3. Ünite: Akışkanlar", ["Katı Basıncı", "Sıvı Basıncı", "Açık Hava Basıncı", "Kaldırma Kuvveti", "Bernoulli İlkesi"]],
      [
        "4. Ünite: Enerji - 1",
        ["Isı, Sıcaklık ve İç Enerji", "Öz Isı ve Isı Sığası", "Hâl Değişimi", "Isı Alışverişi ve Isıl Denge", "Isının Aktarım Yolları ve Isı İletim Hızı"],
      ],
      ["5. Ünite: Kuvvet ve Hareket - 2", ["Sabit Hızlı Hareket", "Bir Boyutta Sabit İvmeli Hareket", "Serbest Düşme", "İki Boyutta Sabit İvmeli Hareket"]],
      ["6. Ünite: Enerji - 2", ["İş, Enerji ve Güç", "Enerji Biçimleri", "Mekanik Enerji", "Enerji Kaynakları"]],
      [
        "7. Ünite: Elektrik",
        [
          "Basit Elektrik Devreleri ve Elektrik Akımı",
          "Ohm Yasası ve Dirençlerin Bağlanması",
          "Üreteçlerin Bağlanması",
          "Elektrik Akımının Oluşturabileceği Tehlikelere Karşı Alınması Gereken Önlemler ve Topraklamanın Önemi",
        ],
      ],
      [
        "8. Ünite: Dalgalar",
        [
          "Dalgaların Temel Kavramları",
          "Dalgaların Sınıflandırılması ve Dalgaların Yayılma Süratini Etkileyen Etmenler",
          "Periyodik Hareketler",
          "Su Dalgalarında Yansıma ve Kırılma",
          "Rezonans ve Deprem",
        ],
      ],
    ]);
  });

  it("shows 33 leaf rows with no group headings; all 45 raw topics are hidden members, each once, none excluded", () => {
    const rows = flattenSelectionRows(fizik);
    expect(rows).toHaveLength(33);
    expect(rows.every((r) => r.readOnlyNames.length === 0 && r.groupLabel === undefined)).toBe(true);
    expect(withGroupHeadings(rows).every((h) => h.kind === "row")).toBe(true);
    expect(rows.filter((r) => r.unitRowSpan !== null).map((r) => r.unitRowSpan)).toEqual([2, 4, 5, 5, 4, 4, 4, 5]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-fizik"]).unresolved).toEqual([]);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-fizik"]).excluded).toEqual([]);
    expect(rawFizik).toHaveLength(45); // 24 (9th) + 21 (10th)
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(ids.slice().sort()).toEqual(rawFizik.slice().sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(fizik.units.some((u) => u.unit === "Diğer" || /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
  });

  it("rolls the raw topics into the right bölüm", () => {
    const members = (label: string) => flattenSelectionRows(fizik).find((r) => r.label === label)!.memberTopicIds;
    expect(members("Vektörler")).toHaveLength(3);
    expect(members("Katı Basıncı")).toEqual(["maarif9-fizik-u2-t0"]);
    expect(members("Isı, Sıcaklık ve İç Enerji")).toEqual(["maarif9-fizik-u3-t0", "maarif9-fizik-u3-t1"]);
    expect(members("Isı Alışverişi ve Isıl Denge")).toEqual(["maarif9-fizik-u3-t4"]);
    expect(members("Ohm Yasası ve Dirençlerin Bağlanması")).toEqual(["maarif10-fizik-u2-t2", "maarif10-fizik-u2-t3"]);
    expect(members("Rezonans ve Deprem")).toEqual(["maarif10-fizik-u3-t5"]);
  });

  it("the 11th grade's own Fizik (the 11. Sınıf tab) is untouched", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-fizik")!;
    expect(courseHasBuckets(own)).toBe(false);
  });
});

describe("Kimya: Tema -> intermediate group -> bucket leaf", () => {
  // unit -> group -> buckets, as the UI shows them
  const tree = () => {
    const out: [string, [string, string[]][]][] = [];
    for (const row of flattenSelectionRows(kimya)) {
      let unit = out[out.length - 1];
      if (!unit || unit[0] !== row.unitLabel) {
        unit = [row.unitLabel, []];
        out.push(unit);
      }
      const group = unit[1][unit[1].length - 1];
      if (group && group[0] === row.groupLabel) group[1].push(row.label);
      else unit[1].push([row.groupLabel ?? "", [row.label]]);
    }
    return out;
  };

  it("has the coach's 6 themes, their intermediate groups and buckets, in order", () => {
    expect(tree()).toEqual([
      [
        "1. Tema: Etkileşim",
        [
          ["Kimya Hayattır", ["Günlük Hayatta Kimya", "Kimyanın Alt Disiplinleri", "Kimyasal Maddelerin Kullanımı ve Güvenlik"]],
          ["Atomdan Periyodik Tabloya", ["Atom Teorileri, Atomun Yapısı", "Atom Orbitalleri ve Elektron Dizilimi", "Periyodik Tabloda Yer Bulma", "Periyodik Özellikler"]],
        ],
      ],
      [
        "2. Tema: Çeşitlilik",
        [
          ["Etkileşimler", ["Metalik Bağ", "İyonik Bağ", "Kovalent Bağ", "Lewis Nokta Yapısı", "Molekül Polarlığı ve Apolarlığı", "Bileşiklerin Adlandırılması"]],
          ["Etkileşimden Maddeye", ["Moleküller Arası Etkileşimler", "Katılar ve Özellikleri", "Sıvılar ve Özellikleri"]],
        ],
      ],
      ["3. Tema: Sürdürülebilirlik", [["Nanoparçacıklar ve Ekolojik Sürdürülebilirlik", ["Metal Nanoparçacıklar", "Yeşil Kimyanın Atık Önleme İlkesi"]]]],
      [
        "4. Tema: Etkileşim",
        [
          [
            "Kimyasal Tepkimeler",
            [
              "Kimyasal Tepkimelerin Oluşumu",
              "Kimyasal Tepkime Türleri (Çökelme Tepkimeleri)",
              "Mol Kavramı",
              "Kimyasal Tepkime Denklemlerinin Denkleştirilmesi",
              "Kimyasal (Stokiyometrik) Hesaplamalar",
            ],
          ],
          ["Gazlar", ["Gazların Özellikleri ve Gaz Yasaları", "İdeal Gaz Yasası", "Gazların Kinetik Moleküler Teorisi, Difüzyon ve Efüzyon Yasası"]],
        ],
      ],
      [
        "5. Tema: Çeşitlilik",
        [
          [
            "Çözeltiler",
            [
              "Çözünme Süreci",
              "Maddelerin Birbiri İçinde Çözünebilirliği",
              "Çözünme Olayının Sınıflandırılması",
              "Çözeltilerde Derişim",
              "Çözünürlük",
              "Çözünürlüğe Etki Eden Faktörler",
              "Çözeltilerin Sınıflandırılması",
              "Koligatif Özellikler",
            ],
          ],
        ],
      ],
      [
        "6. Tema: Sürdürülebilirlik",
        [["Yeşil Kimya, Çevresel ve Ekolojik Sürdürülebilirlik", ["Makro ve Mikro Ölçekli Deneyler, Atmosferdeki Tepkimeler ve Küresel Sorunlar"]]],
      ],
    ]);
  });

  it("shows 35 leaf rows; the raw topics are hidden members; only the 2 unlisted ones are left out", () => {
    const rows = flattenSelectionRows(kimya);
    expect(rows).toHaveLength(35);
    expect(rows.every((r) => r.readOnlyNames.length === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes(" › "))).toBe(false);
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-kimya"]).unresolved).toEqual([]);
    expect(rawKimya).toHaveLength(38); // 20 (9th) + 18 (10th)
    const excludedIds = [
      "maarif9-kimya-u0-t2", // Kimya Alanında Kariyer Olanakları
      "maarif9-kimya-u2-t2", // Metal, Alaşım ve Metal Nanoparçacıkların Çevreye Etkisi
    ];
    expect(resolveSpec(SUBJECT_SPECS["maarif-tyt-kimya"]).excluded.map((t) => t.id).sort()).toEqual(excludedIds.slice().sort());
    const ids = rows.flatMap((r) => r.memberTopicIds);
    expect(ids).toHaveLength(36);
    expect(ids.slice().sort()).toEqual(rawKimya.filter((id) => !excludedIds.includes(id)).sort());
    expect(new Set(ids).size).toBe(ids.length);
    const everyId = kimya.units.flatMap((u) => u.topics.map((t) => t.id));
    for (const id of excludedIds) expect(everyId).not.toContain(id);
    expect(kimya.units.some((u) => u.unit === "Diğer" || /^\(\d+\. Sınıf\)/.test(u.unit))).toBe(false);
  });

  it("the Gazlar bucket with two raw topics saves against the first and reads from both", () => {
    const row = flattenSelectionRows(kimya).find((r) => r.label.startsWith("Gazların Kinetik"))!;
    expect(row.memberTopicIds).toEqual(["maarif10-kimya-u0-t6", "maarif10-kimya-u0-t8"]);
    expect(row.id).toBe("maarif10-kimya-u0-t6");
  });

  it("splices one heading row per group into the table and extends each unit's span over them", () => {
    const headed = withGroupHeadings(flattenSelectionRows(kimya));
    expect(headed).toHaveLength(35 + 9); // 9 group headings
    expect(headed.filter((h) => h.kind === "heading").map((h) => (h.kind === "heading" ? h.label : ""))).toEqual([
      "Kimya Hayattır",
      "Atomdan Periyodik Tabloya",
      "Etkileşimler",
      "Etkileşimden Maddeye",
      "Nanoparçacıklar ve Ekolojik Sürdürülebilirlik",
      "Kimyasal Tepkimeler",
      "Gazlar",
      "Çözeltiler",
      "Yeşil Kimya, Çevresel ve Ekolojik Sürdürülebilirlik",
    ]);
    expect(headed.filter((h) => h.unitRowSpan !== null).map((h) => h.unitRowSpan)).toEqual([9, 11, 3, 10, 9, 2]);
    // The unit cell sits on the first item of the unit, which is its first heading.
    expect(headed[0].kind).toBe("heading");
    expect(headed[0].unitRowSpan).toBe(9);
    // Spans add up to every item, so no row is left uncovered.
    expect(headed.reduce((n, h) => n + (h.unitRowSpan ?? 0), 0)).toBe(headed.length);
  });

  it("the 11th grade's own Kimya (the 11. Sınıf tab) is untouched", () => {
    const own = MAARIF11_KAYNAK_COURSES.find((c) => c.id === "maarif11-kimya")!;
    expect(courseHasBuckets(own)).toBe(false);
    expect(own.units.some((u) => u.group !== undefined)).toBe(false);
  });
});

describe("withGroupHeadings leaves every group-less course exactly as it is", () => {
  it("Tarih, Coğrafya and Biyoloji get no heading rows and keep their own spans", () => {
    for (const course of [tarih, cografya, biyoloji]) {
      const rows = flattenSelectionRows(course);
      const headed = withGroupHeadings(rows);
      expect(headed.every((h) => h.kind === "row")).toBe(true);
      expect(headed.map((h) => h.unitRowSpan)).toEqual(rows.map((r) => r.unitRowSpan));
    }
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
    expect(Object.keys(SUBJECT_SPECS)).toEqual(["maarif-tyt-cografya", "maarif-tyt-tarih", "maarif-tyt-biyoloji", "maarif-tyt-kimya", "maarif-tyt-fizik", "maarif-tyt-geometri", "maarif-tyt-matematik", "maarif-tyt-turk-dili-ve-edebiyati"]);
    expect(hasBucketedStructure("maarif-tyt-turk-dili-ve-edebiyati")).toBe(true);
    expect(hasBucketedStructure("maarif11-turk-dili-ve-edebiyati")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-matematik")).toBe(true);
    expect(hasBucketedStructure("maarif11-matematik")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-geometri")).toBe(true);
    expect(hasBucketedStructure("maarif11-geometri")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-fizik")).toBe(true);
    expect(hasBucketedStructure("maarif11-fizik")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-kimya")).toBe(true);
    expect(hasBucketedStructure("maarif11-kimya")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-biyoloji")).toBe(true);
    expect(hasBucketedStructure("maarif11-biyoloji")).toBe(false);
    expect(hasBucketedStructure("maarif-tyt-tarih")).toBe(true);
    expect(hasBucketedStructure("maarif11-tarih")).toBe(false);
    expect(hasBucketedStructure("toString")).toBe(false);
    const din = merged("maarif-tyt-din-kulturu");
    expect(courseHasBuckets(din)).toBe(false);
    expect(din.units.every((u) => /^\((9|10)\. Sınıf\) /.test(u.unit))).toBe(true);
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
