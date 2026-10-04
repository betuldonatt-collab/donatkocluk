// Deneme Analizi view for the 11th grade's "Maarif TYT" subjects.
//
// An 11th grader's TYT-style exam covers the 9th AND 10th grade curricula, so
// the analysis table can't just print the school's grade-and-unit lists. This
// module is the mapping layer: it rolls the raw 9th/10th topics (the ones the
// mistakes are actually tagged on) up into the coach's holistic buckets,
// grouped under the unit they belong to, and the analysis tables render those
// buckets instead (a bucket is marked when any of its topics was missed).
//
// The structure itself lives in maarif-tyt-structure.ts (one spec per
// subject, shared with Kaynak Takibi where a subject asks for it). A subject
// only gets the bucketed view once it has a spec there -- every other merged
// course keeps its plain per-topic table until its mapping is added.
//
// VIEW ONLY: nothing here writes anything or touches the curriculum data.
// Anything a bucket doesn't claim lands in a per-subject "Diğer" row, so a
// topic that doesn't fit (or one added to the data later) is still shown
// instead of silently disappearing.
import type { Course } from "./index";
import { isMaarifTytMergedCourseId, MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { resolveSpec, SUBJECT_SPECS, type SubjectSpec } from "./maarif-tyt-structure";
import type { SelectionRow } from "./rows";

export type DenemeBucket = { key: string; label: string; topicIds: string[] };
export type DenemeUnit = { label: string; buckets: DenemeBucket[] };
export type DenemeMapping = {
  courseId: string;
  units: DenemeUnit[];
  // Raw topics of the course that no bucket claims -- the "Diğer" row.
  otherTopicIds: string[];
  // Spec entries that matched no topic (a typo, or the data changed):
  // surfaced for the tests, never thrown at runtime.
  unresolved: string[];
};

// Builds a subject's mapping against its merged course. Exported (with the
// spec as an argument) so the fallback can be tested without real data gaps.
export function buildDenemeMapping(course: Course, spec: SubjectSpec): DenemeMapping {
  const resolved = resolveSpec(spec);
  const claimed = new Set<string>();
  const units: DenemeUnit[] = resolved.units.map((unit, ui) => ({
    label: unit.label,
    buckets: unit.buckets.map((bucket, bi) => {
      const topicIds = bucket.topics.map((t) => t.id);
      topicIds.forEach((id) => claimed.add(id));
      return { key: `${course.id}-b${ui}-${bi}`, label: bucket.label, topicIds };
    }),
  }));
  const otherTopicIds = course.units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => !claimed.has(id));
  return { courseId: course.id, units, otherTopicIds, unresolved: resolved.unresolved };
}

const cache = new Map<string, DenemeMapping | null>();

// The bucketed view of a merged "Maarif TYT" course, or null when its subject
// has no mapping yet (the table then keeps its plain per-topic rows).
export function maarifTytDenemeMappingFor(courseId: string): DenemeMapping | null {
  // Merged "Maarif TYT" courses only -- the 11th grade's own "11. Sınıf" courses
  // (maarif11-*) and every other course never get a bucketed view.
  if (!isMaarifTytMergedCourseId(courseId)) return null;
  if (cache.has(courseId)) return cache.get(courseId)!;
  const course = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === courseId);
  const spec = SUBJECT_SPECS[courseId];
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
export const MAARIF_TYT_DENEME_MAPPED_COURSE_IDS = Object.keys(SUBJECT_SPECS);
export type { SubjectSpec as DenemeSubjectSpec };
