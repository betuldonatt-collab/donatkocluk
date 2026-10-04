// The coach's holistic structure for the 11th grade's "Maarif TYT" subjects:
// units, and under each unit its buckets, each bucket rolled up from the raw
// 9th/10th grade topics. One spec per subject, read by two views that must
// never drift apart:
//
//   - the Deneme Analizi table (maarif-tyt-deneme-mapping.ts) shows the
//     buckets as rows, marked with an X when one of their topics was missed;
//   - for a subject marked `alignKaynakTakibi`, the merged "Maarif TYT" course
//     itself (maarif-tyt.ts) is laid out in this structure, so Kaynak
//     Takibi's tracking cells line up with the same buckets.
//
// It only READS the 9th/10th data (maarif9.json / maarif10.json are never
// modified, nor are the 9th/10th graders' own courses); topic ids are always
// the real ones. A topic no bucket claims is never dropped: Deneme Analizi
// shows it in a "Diğer" row and Kaynak Takibi keeps it as its own entry.
import type { Course, Topic, Unit } from "./index";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";

// Where a bucket's topics come from: a unit of a 9th/10th grade course
// (1-based, in the course's own unit order), either all of it or only some
// topics, named by title (the last " › " part of the topic's name) or by
// 1-based position in that unit.
export type Source = { course: string; unit: number; topics?: (string | number)[] };
export type BucketSpec = { label: string; from: Source[] };
export type UnitSpec = { label: string; buckets: BucketSpec[] };
export type SubjectSpec = {
  units: UnitSpec[];
  // True when the merged course should ALSO be laid out in this structure in
  // Kaynak Takibi (see alignedUnits), not only in Deneme Analizi.
  alignKaynakTakibi?: boolean;
};

export const SUBJECT_SPECS: Record<string, SubjectSpec> = {
  "maarif-tyt-cografya": {
    units: [
      {
        label: "1. Ünite: Coğrafyanın Doğası",
        buckets: [
          { label: "Coğrafya Bilimi", from: [{ course: "maarif9-cografya", unit: 1 }] },
          { label: "Coğrafi Bakış", from: [{ course: "maarif10-cografya", unit: 1 }] },
        ],
      },
      {
        label: "2. Ünite: Mekânsal Bilgi Teknolojileri",
        buckets: [
          {
            label: "Harita Okuryazarlığı",
            from: [{ course: "maarif9-cografya", unit: 2, topics: ["Mekânın Sembolik Dili: Harita", "Türkiye’nin Coğrafi Konumu"] }],
          },
          {
            label: "Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları",
            from: [
              { course: "maarif9-cografya", unit: 2, topics: ["Mekânsal Bilgi Teknolojilerinin Bileşenleri"] },
              { course: "maarif10-cografya", unit: 2 },
            ],
          },
        ],
      },
      {
        label: "3. Ünite: Doğal Sistemler ve Süreçler",
        buckets: [
          { label: "İklim Sistemi", from: [{ course: "maarif9-cografya", unit: 3 }] },
          { label: "Yeryüzünün Şekillenmesi", from: [{ course: "maarif10-cografya", unit: 3 }] },
        ],
      },
      {
        label: "4. Ünite: Beşerî Sistemler ve Süreçler",
        buckets: [
          { label: "Nüfus Dinamikleri", from: [{ course: "maarif9-cografya", unit: 4 }] },
          { label: "Yerleşme", from: [{ course: "maarif10-cografya", unit: 4 }] },
        ],
      },
      {
        label: "5. Ünite: Ekonomik Faaliyetler ve Etkileri",
        buckets: [
          { label: "Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", from: [{ course: "maarif9-cografya", unit: 5 }] },
          { label: "Ekonomik Faaliyetler ve Sektörel Yapı", from: [{ course: "maarif10-cografya", unit: 5 }] },
        ],
      },
      {
        label: "6. Ünite: Afetler ve Sürdürülebilir Çevre",
        buckets: [
          { label: "Afetler", from: [{ course: "maarif9-cografya", unit: 6 }] },
          { label: "Afetlerle Mücadele", from: [{ course: "maarif10-cografya", unit: 6 }] },
        ],
      },
      {
        label: "7. Ünite: Bölgeler, Ülkeler ve Küresel Bağlantılar",
        buckets: [
          { label: "Bölge ve Bölge Sınırı", from: [{ course: "maarif9-cografya", unit: 7 }] },
          { label: "Türk Kültürünün Mekânsal Özellikleri", from: [{ course: "maarif10-cografya", unit: 7 }] },
        ],
      },
    ],
  },

  // Tarih: units 1-3 are 9th grade's, 4-6 are 10th grade's. Topics are picked
  // by position (the coach's wording differs slightly from the raw titles);
  // the raw title is noted beside each. The structure is also Kaynak Takibi's.
  "maarif-tyt-tarih": {
    alignKaynakTakibi: true,
    units: [
      {
        label: "1. Ünite: Geçmişin İnşa Sürecinde Tarih",
        buckets: [
          { label: "Tarih Öğrenmenin Faydaları", from: [{ course: "maarif9-tarih", unit: 1, topics: [1] }] },
          { label: "Tarihin Doğası", from: [{ course: "maarif9-tarih", unit: 1, topics: [2] }] },
          {
            // 3: Tarihsel Bilginin Üretim Süreci, 4: Tarih Araştırma ve Yazımında Dijital Dönüşüm
            label: "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm",
            from: [{ course: "maarif9-tarih", unit: 1, topics: [3, 4] }],
          },
        ],
      },
      {
        label: "2. Ünite: Eski Çağ Medeniyetleri",
        buckets: [
          { label: "Tarım Devrimi'nin Eski Çağ'a Etkileri", from: [{ course: "maarif9-tarih", unit: 2, topics: [1] }] },
          { label: "Eski Çağ'da Yönetenler ve Savaşanlar", from: [{ course: "maarif9-tarih", unit: 2, topics: [2] }] },
          { label: "Eski Çağ'da Hukuk", from: [{ course: "maarif9-tarih", unit: 2, topics: [3] }] },
          { label: "Eski Çağ'da İnanç, Bilim ve Sanat", from: [{ course: "maarif9-tarih", unit: 2, topics: [4] }] },
          { label: "Türklerde Konargöçer Yaşam", from: [{ course: "maarif9-tarih", unit: 2, topics: [5] }] },
        ],
      },
      {
        label: "3. Ünite: Orta Çağ Medeniyetleri",
        buckets: [
          { label: "Orta Çağ'daki Kitlesel Göçler ve Avrupa Hun Devleti", from: [{ course: "maarif9-tarih", unit: 3, topics: [1] }] },
          { label: "Orta Çağ'daki Siyasi ve Askeri Gelişmeler", from: [{ course: "maarif9-tarih", unit: 3, topics: [2] }] },
          { label: "Orta Çağ'da Ticaret Yolları", from: [{ course: "maarif9-tarih", unit: 3, topics: [3] }] },
          { label: "Orta Çağ'da Bilim, Kültür ve Sanat", from: [{ course: "maarif9-tarih", unit: 3, topics: [4] }] },
        ],
      },
      {
        label: "4. Ünite: Türkistan'dan Türkiye'ye (1040-1299)",
        buckets: [
          { label: "Önemli Askeri Mücadelelerin Türk Tarihinin Seyrine Etkileri", from: [{ course: "maarif10-tarih", unit: 1, topics: [1] }] },
          { label: "Türkistan'dan Türkiye'ye Türklerde Devlet ve Ordu Teşkilatları", from: [{ course: "maarif10-tarih", unit: 1, topics: [2] }] },
          { label: "Türklerde Sosyoekonomik Hayat ve Şehirleşme", from: [{ course: "maarif10-tarih", unit: 1, topics: [3] }] },
          { label: "Türk-İslam Medeniyetinde Bilim, Kültür, Eğitim ve Sanat", from: [{ course: "maarif10-tarih", unit: 1, topics: [4] }] },
        ],
      },
      {
        // The 5th topic of 10th grade's unit 2 (Osmanlı Devleti'nin İlim ve
        // İrfan Geleneği) is in none of the coach's buckets: it is kept, as
        // its own entry (Kaynak Takibi) / in the "Diğer" row (Deneme Analizi).
        label: "5. Ünite: Beylikten Devlete Osmanlı (1299 - 1453)",
        buckets: [
          { label: "Osmanlı Devleti'nin Kuruluşuna Dair Görüşler", from: [{ course: "maarif10-tarih", unit: 2, topics: [1] }] },
          { label: "Beylikten Devlete Siyasi ve Askerî Gelişmeler", from: [{ course: "maarif10-tarih", unit: 2, topics: [2] }] },
          { label: "Osmanlı Devleti'nin İskân ve İstimâlet Politikası", from: [{ course: "maarif10-tarih", unit: 2, topics: [4] }] },
          { label: "Osmanlı Devleti'nde Ordu, Hukuk ve Toprak Sistemi", from: [{ course: "maarif10-tarih", unit: 2, topics: [3] }] },
        ],
      },
      {
        label: "6. Ünite: Cihan Devleti Osmanlı (1453 - 1683)",
        buckets: [
          { label: "Osmanlı Devleti'nin Cihan Devleti Hâline Gelmesi", from: [{ course: "maarif10-tarih", unit: 3, topics: [1] }] },
          { label: "Osmanlı Devleti'nin Yönetim ve Ordu Yapısında Değişim", from: [{ course: "maarif10-tarih", unit: 3, topics: [2] }] },
          { label: "Avrupalıların Sömürgeci Politikaları", from: [{ course: "maarif10-tarih", unit: 3, topics: [3] }] },
          { label: "Osmanlı Devleti'nde İsyanlar", from: [{ course: "maarif10-tarih", unit: 3, topics: [4] }] },
          { label: "Osmanlı Devleti'nde Bilim, Kültür, Eğitim ve Sanat", from: [{ course: "maarif10-tarih", unit: 3, topics: [5] }] },
        ],
      },
    ],
  },
};

const SOURCE_COURSES: Course[] = [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES];

const leafTitle = (name: string) => name.split(" › ").pop()!;
// Apostrophes and spacing differ between the coach's wording and the sheet's.
const norm = (s: string) => s.replace(/[’‘´`]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");

export type ResolvedBucket = { label: string; topics: Topic[] };
export type ResolvedUnit = { label: string; buckets: ResolvedBucket[] };
export type ResolvedSpec = {
  units: ResolvedUnit[];
  // Spec entries that matched nothing (a typo, or the data changed) --
  // surfaced for the tests, never thrown at runtime.
  unresolved: string[];
};

function resolveSource(source: Source, unresolved: string[]): Topic[] {
  const course = SOURCE_COURSES.find((c) => c.id === source.course);
  const unit = course?.units[source.unit - 1];
  if (!unit) {
    unresolved.push(`${source.course} unit ${source.unit}`);
    return [];
  }
  if (!source.topics) return unit.topics;
  const picked: Topic[] = [];
  for (const ref of source.topics) {
    const topic = typeof ref === "number" ? unit.topics[ref - 1] : unit.topics.find((t) => norm(leafTitle(t.name)) === norm(ref));
    if (topic) picked.push(topic);
    else unresolved.push(`${source.course} unit ${source.unit}: ${JSON.stringify(ref)}`);
  }
  return picked;
}

// Resolves a spec against the real 9th/10th topics. A topic is claimed by the
// FIRST bucket that names it, so nothing is ever counted twice.
export function resolveSpec(spec: SubjectSpec): ResolvedSpec {
  const unresolved: string[] = [];
  const claimed = new Set<string>();
  const units = spec.units.map((unit) => ({
    label: unit.label,
    buckets: unit.buckets.map((bucket) => {
      const topics = bucket.from.flatMap((source) => resolveSource(source, unresolved)).filter((t) => !claimed.has(t.id));
      topics.forEach((t) => claimed.add(t.id));
      return { label: bucket.label, topics };
    }),
  }));
  return { units, unresolved };
}

// The merged course's units for a subject whose spec drives Kaynak Takibi.
// Each bucket becomes its OWN unit entry under its spec unit's label (so the
// table gives it its own tracking cells, and consecutive same-label entries
// still share one merged Ünite cell): a bucket with one topic is that topic
// named by the bucket, one with several is a heading group
// ("Bucket › topic"). Raw topic ids are kept. A topic no bucket claims is
// kept too, as its own entry at the end of the unit it came from (or under
// "Diğer" when no spec unit uses that source unit).
export function alignedUnits(spec: SubjectSpec): Unit[] {
  const resolved = resolveSpec(spec);
  const claimed = new Set(resolved.units.flatMap((u) => u.buckets.flatMap((b) => b.topics.map((t) => t.id))));
  const used = new Set(spec.units.flatMap((u) => u.buckets.flatMap((b) => b.from.map((s) => s.course))));

  const leftoversBySourceUnit = new Map<string, Topic[]>();
  for (const course of SOURCE_COURSES.filter((c) => used.has(c.id))) {
    course.units.forEach((unit, ui) => {
      const rest = unit.topics.filter((t) => !claimed.has(t.id));
      if (rest.length > 0) leftoversBySourceUnit.set(`${course.id}#${ui + 1}`, rest);
    });
  }

  const taken = new Set<string>();
  const units: Unit[] = [];
  spec.units.forEach((unitSpec, ui) => {
    resolved.units[ui].buckets.forEach((bucket) => {
      if (bucket.topics.length === 0) return;
      const single = bucket.topics.length === 1;
      units.push({
        unit: unitSpec.label,
        topics: bucket.topics.map((t) => ({ id: t.id, name: single ? bucket.label : `${bucket.label} › ${t.name}` })),
      });
    });
    const sourceKeys = new Set(unitSpec.buckets.flatMap((b) => b.from.map((s) => `${s.course}#${s.unit}`)));
    for (const key of sourceKeys) {
      if (taken.has(key)) continue;
      taken.add(key);
      for (const topic of leftoversBySourceUnit.get(key) ?? []) units.push({ unit: unitSpec.label, topics: [{ id: topic.id, name: topic.name }] });
    }
  });
  for (const [key, topics] of leftoversBySourceUnit) {
    if (taken.has(key)) continue;
    for (const topic of topics) units.push({ unit: "Diğer", topics: [{ id: topic.id, name: topic.name }] });
  }
  return units;
}
