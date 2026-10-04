// The coach's holistic structure for the 11th grade's "Maarif TYT" subjects:
// units, and under each unit its buckets, each bucket rolled up from the raw
// 9th/10th grade topics. One spec per subject.
//
// THE BUCKETS ARE THE LEAVES. A subject with a spec is laid out in its buckets
// everywhere an 11th grader (or their coach) sees it -- Kaynak Takibi, the
// Deneme/Branş analysis tables and mistake picker, Çıkmış Sorular: each bucket
// is one row with one set of checkboxes / one X, and the raw 9th/10th topics
// inside it are never listed. They only live on as the bucket's hidden members
// (Unit.topics, real ids) so what is saved still lands on real topic ids: a
// bucket's tracking is written against its first member's id, and read back
// from all of them.
//
// It only READS the 9th/10th data (maarif9.json / maarif10.json are never
// modified, nor are the 9th/10th graders' own courses). A topic no bucket claims
// is never dropped: it becomes a leaf of its own (see alignedUnits).
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
  // Raw topics the coach's list has no place for, left OUT of the structure on
  // purpose (never shown, never tracked). Everything else a bucket does not
  // claim is still kept, as a leaf of its own (see alignedUnits) -- so a topic
  // only disappears when it is named here.
  excluded?: Source[];
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
        label: "5. Ünite: Beylikten Devlete Osmanlı (1299 - 1453)",
        buckets: [
          { label: "Osmanlı Devleti'nin Kuruluşuna Dair Görüşler", from: [{ course: "maarif10-tarih", unit: 2, topics: [1] }] },
          { label: "Beylikten Devlete Siyasi ve Askerî Gelişmeler", from: [{ course: "maarif10-tarih", unit: 2, topics: [2] }] },
          { label: "Osmanlı Devleti'nin İskân ve İstimâlet Politikası", from: [{ course: "maarif10-tarih", unit: 2, topics: [4] }] },
          { label: "Osmanlı Devleti'nde Ordu, Hukuk ve Toprak Sistemi", from: [{ course: "maarif10-tarih", unit: 2, topics: [3] }] },
          { label: "Osmanlı Devleti'nin İlim ve İrfan Geleneği", from: [{ course: "maarif10-tarih", unit: 2, topics: [5] }] },
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

  // Biyoloji: Tema 1-2 are 9th grade's two themes, Tema 3-4 are 10th grade's two units.
  // Topics are picked by 1-based position in the raw unit, and ONLY ones that match a
  // bucket of the coach's list are placed. The raw topics the list has no place for are
  // `excluded` below -- dropped from the structure, not attached to a nearby bucket.
  //  - Komünite and Popülasyon Ekolojisi are ONE raw topic ("Komünitelerde ve Popülasyonlarda
  //    Görülen Etkileşimler ve Değişimler"), and a bucket needs a real topic id of its own, so
  //    they are a single bucket (approved).
  //  - Kept on purpose: "Canlılık İçin Enerjinin Önemi" is the only raw topic for Enerji Molekülü
  //    ATP (without it that bucket would have nothing to track); "Fotosentezde Kullanılan ve
  //    Üretilen Maddeler" is part of Fotosentez Reaksiyonları; "Canlıların Biyolojik Çeşitlilik
  //    Veri Tabanı" is biodiversity content (the last bucket).
  "maarif-tyt-biyoloji": {
    units: [
      {
        label: "1. Tema: Yaşam",
        buckets: [
          { label: "Biyoloji Bilimi ve Bilimsel Araştırma Süreçleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [1, 2, 3] }] },
          { label: "Canlıların Ortak Özellikleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }] },
          { label: "Virüsler", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [15] }] },
          { label: "Canlıların Sınıflandırılması", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [16] }] },
          { label: "Bakteri ve Arke Âlemleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [17, 18] }] },
          { label: "Protista ve Bitki Âlemleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [20, 21] }] },
          { label: "Mantarlar Âlemi", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [22] }] },
          { label: "Omurgasız Hayvanlar", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [24] }] },
          { label: "Omurgalı Hayvanlar ve Biyoçeşitlilik", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [25, 26, 27] }] },
        ],
      },
      {
        label: "2. Tema: Organizasyon",
        buckets: [
          { label: "İnorganik Moleküller", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [1, 2] }] },
          { label: "Karbohidratlar", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [3] }] },
          { label: "Lipitler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [4] }] },
          { label: "Proteinler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [5] }] },
          { label: "Enzimler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [6] }] },
          { label: "Nükleik Asitler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [7] }] },
          { label: "Vitaminler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [8, 9] }] },
          { label: "Hücre ve Alt Birimleri - I", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [11, 12] }] },
          { label: "Hücre ve Alt Birimleri - II", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [13] }] },
          { label: "Difüzyon ve Ozmoz", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [15] }] },
          { label: "Aktif Taşıma, Endositoz ve Ekzositoz", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [14] }] },
        ],
      },
      {
        label: "3. Tema: Enerji",
        buckets: [
          { label: "Enerji Molekülü ATP", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [1] }] },
          { label: "Fotosentez Reaksiyonları", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [2, 3] }] },
          { label: "Fotosentez Hızını Etkileyen Faktörler ve Kemosentez", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [4] }] },
          { label: "Canlılarda Sindirim", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [5] }] },
          { label: "İnsanda Sindirim", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [6] }] },
          { label: "Oksijenli Solunum", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [7, 8] }] },
          { label: "Fermantasyon ve Beslenme", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [9] }] },
        ],
      },
      {
        label: "4. Tema: Ekoloji",
        buckets: [
          { label: "Ekosistemin Bileşenleri", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [1] }] },
          { label: "Komünite ve Popülasyon Ekolojisi", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [2] }] },
          { label: "Ekosistemde Madde ve Enerji Akışı", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [3] }] },
          { label: "Madde Döngüleri", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [4] }] },
          { label: "Ekolojik Sürdürülebilirlik", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [5, 6, 7, 8, 9] }] },
        ],
      },
    ],
    excluded: [
      // 9th grade, 1. Tema: "Sınıflandırmada Üç Üst Âlem Sistemi › Biyolojik Sınıflandırma Sistemi › Ökaryotlar" (19)
      // and "... › Ökaryotik Canlıların Sınıflandırılması › Hayvanlar" (23)
      { course: "maarif9-biyoloji", unit: 1, topics: [19, 23] },
      // 9th grade, 2. Tema: "Organik Moleküllerin Tayininde Kullanılan Ayıraçlar" (10) and
      // "Hücre, Doku, Organ ve Sistemlerin Organizasyonu" (16)
      { course: "maarif9-biyoloji", unit: 2, topics: [10, 16] },
      // 10th grade, Enerji: "Besinlerden Enerjiye › Enerji-Metabolizma İlişkisi" (10)
      { course: "maarif10-biyoloji", unit: 1, topics: [10] },
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
  // The raw topics the spec deliberately leaves out.
  excluded: Topic[];
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
  const excluded = (spec.excluded ?? []).flatMap((source) => resolveSource(source, unresolved));
  return { units, excluded, unresolved };
}

// True when a merged "Maarif TYT" course has a bucket structure (and so is
// laid out in buckets everywhere -- see alignedUnits).
export function hasBucketedStructure(courseId: string | null | undefined): boolean {
  return !!courseId && Object.prototype.hasOwnProperty.call(SUBJECT_SPECS, courseId);
}

// The merged course's units for a subject with a spec. Each bucket becomes its
// OWN unit entry under its spec unit's label (consecutive same-label entries
// still share one merged Ünite cell), marked as a leaf (Unit.bucket): the UI
// shows the bucket's name and nothing beneath it. The raw 9th/10th topics stay
// in `topics` -- real ids, real names -- only as the bucket's hidden members,
// so progress and mistakes can still be saved and read against them. A topic no
// bucket claims is never dropped: it becomes a leaf of its own (named by itself)
// at the end of the unit it came from, or under "Diğer" when no spec unit
// uses that source unit.
export function alignedUnits(spec: SubjectSpec): Unit[] {
  const resolved = resolveSpec(spec);
  const claimed = new Set([
    ...resolved.units.flatMap((u) => u.buckets.flatMap((b) => b.topics.map((t) => t.id))),
    ...resolved.excluded.map((t) => t.id),
  ]);
  const used = new Set(spec.units.flatMap((u) => u.buckets.flatMap((b) => b.from.map((s) => s.course))));

  const leftoversBySourceUnit = new Map<string, Topic[]>();
  for (const course of SOURCE_COURSES.filter((c) => used.has(c.id))) {
    course.units.forEach((unit, ui) => {
      const rest = unit.topics.filter((t) => !claimed.has(t.id));
      if (rest.length > 0) leftoversBySourceUnit.set(`${course.id}#${ui + 1}`, rest);
    });
  }

  const leftoverLeaf = (unit: string, topic: Topic): Unit => ({
    unit,
    bucket: leafTitle(topic.name),
    topics: [{ id: topic.id, name: topic.name }],
  });

  const taken = new Set<string>();
  const units: Unit[] = [];
  spec.units.forEach((unitSpec, ui) => {
    resolved.units[ui].buckets.forEach((bucket) => {
      if (bucket.topics.length === 0) return;
      units.push({
        unit: unitSpec.label,
        bucket: bucket.label,
        topics: bucket.topics.map((t) => ({ id: t.id, name: t.name })),
      });
    });
    const sourceKeys = new Set(unitSpec.buckets.flatMap((b) => b.from.map((s) => `${s.course}#${s.unit}`)));
    for (const key of sourceKeys) {
      if (taken.has(key)) continue;
      taken.add(key);
      for (const topic of leftoversBySourceUnit.get(key) ?? []) units.push(leftoverLeaf(unitSpec.label, topic));
    }
  });
  for (const [key, topics] of leftoversBySourceUnit) {
    if (taken.has(key)) continue;
    for (const topic of topics) units.push(leftoverLeaf("Diğer", topic));
  }
  return units;
}
