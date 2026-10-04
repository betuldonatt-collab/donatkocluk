// Deneme Analizi view for the 11th grade's "Maarif TYT" subjects.
//
// An 11th grader's TYT-style exam covers the 9th AND 10th grade curricula, so
// the analysis table can't just print the school's grade-and-unit lists. This
// module is the mapping layer: it rolls the raw 9th/10th topics (the ones the
// mistakes are actually tagged on) up into the coach's holistic buckets,
// grouped under the unit they belong to, and the analysis tables render those
// buckets instead (a bucket is marked when any of its topics was missed).
//
// VIEW ONLY. It never touches the curriculum data (maarif9.json /
// maarif10.json), the merged "Maarif TYT" courses or Kaynak Takibi: it reads
// the raw topics, and nothing here is written anywhere. A subject only gets
// the bucketed view once it has an entry in SPECS -- every other merged
// course keeps its plain per-topic table until its mapping is added.
//
// Anything a bucket doesn't claim lands in a per-subject "Diğer" row, so a
// topic that doesn't fit (or one added to the data later) is still counted
// instead of silently disappearing.
import type { Course } from "./index";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import type { SelectionRow } from "./rows";

// Where a bucket's topics come from: a unit of a 9th/10th grade course
// (1-based, in the course's own unit order), either all of it or only the
// topics with these titles (the last " › " part of a topic's name).
type Source = { course: string; unit: number; topics?: string[] };
type BucketSpec = { label: string; from: Source[] };
type UnitSpec = { label: string; buckets: BucketSpec[] };
type SubjectSpec = { units: UnitSpec[] };

const SPECS: Record<string, SubjectSpec> = {
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
};

export type DenemeBucket = { key: string; label: string; topicIds: string[] };
export type DenemeUnit = { label: string; buckets: DenemeBucket[] };
export type DenemeMapping = {
  courseId: string;
  units: DenemeUnit[];
  // Raw topics of the course that no bucket claims -- the "Diğer" row.
  otherTopicIds: string[];
  // Titles in a spec that matched no topic (a typo, or the data changed):
  // surfaced for the tests, never thrown at runtime.
  unresolved: string[];
};

const SOURCE_COURSES: Course[] = [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES];

const leafTitle = (name: string) => name.split(" › ").pop()!;

function resolveSource(source: Source, unresolved: string[]): string[] {
  const course = SOURCE_COURSES.find((c) => c.id === source.course);
  const unit = course?.units[source.unit - 1];
  if (!unit) {
    unresolved.push(`${source.course} unit ${source.unit}`);
    return [];
  }
  if (!source.topics) return unit.topics.map((t) => t.id);
  const ids: string[] = [];
  for (const title of source.topics) {
    const topic = unit.topics.find((t) => leafTitle(t.name) === title);
    if (topic) ids.push(topic.id);
    else unresolved.push(`${source.course} unit ${source.unit}: "${title}"`);
  }
  return ids;
}

// Builds a subject's mapping against its merged course. Exported (with the
// spec as an argument) so the fallback can be tested without real data gaps.
export function buildDenemeMapping(course: Course, spec: SubjectSpec): DenemeMapping {
  const unresolved: string[] = [];
  const claimed = new Set<string>();
  const units: DenemeUnit[] = spec.units.map((unit, ui) => ({
    label: unit.label,
    buckets: unit.buckets.map((bucket, bi) => {
      const topicIds = bucket.from.flatMap((source) => resolveSource(source, unresolved)).filter((id) => !claimed.has(id));
      topicIds.forEach((id) => claimed.add(id));
      return { key: `${course.id}-b${ui}-${bi}`, label: bucket.label, topicIds };
    }),
  }));
  const otherTopicIds = course.units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => !claimed.has(id));
  return { courseId: course.id, units, otherTopicIds, unresolved };
}

const cache = new Map<string, DenemeMapping | null>();

// The bucketed view of a merged "Maarif TYT" course, or null when its subject
// has no mapping yet (the table then keeps its plain per-topic rows).
export function maarifTytDenemeMappingFor(courseId: string): DenemeMapping | null {
  if (cache.has(courseId)) return cache.get(courseId)!;
  const course = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === courseId);
  const spec = SPECS[courseId];
  const mapping = course && spec ? buildDenemeMapping(course, spec) : null;
  cache.set(courseId, mapping);
  return mapping;
}

export const DENEME_OTHER_LABEL = "Diğer";

// The mapping as table rows, in the same shape the analysis tables already
// render (a bucket is one row; a unit's first row carries its rowSpan). The
// "Diğer" row is appended only when some raw topic didn't fit a bucket.
export function denemeRowsFor(mapping: DenemeMapping): SelectionRow[] {
  const rows: SelectionRow[] = [];
  for (const unit of mapping.units) {
    unit.buckets.forEach((bucket, i) => {
      rows.push({
        id: bucket.key,
        label: bucket.label,
        unitLabel: unit.label,
        unitRowSpan: i === 0 ? unit.buckets.length : null,
        readOnlyNames: [],
        memberTopicIds: bucket.topicIds,
      });
    });
  }
  if (mapping.otherTopicIds.length > 0) {
    rows.push({
      id: `${mapping.courseId}-other`,
      label: DENEME_OTHER_LABEL,
      unitLabel: DENEME_OTHER_LABEL,
      unitRowSpan: 1,
      readOnlyNames: [],
      memberTopicIds: mapping.otherTopicIds,
    });
  }
  return rows;
}

// Exposed for the tests.
export const MAARIF_TYT_DENEME_MAPPED_COURSE_IDS = Object.keys(SPECS);
export type { SubjectSpec as DenemeSubjectSpec };
