import { findCourseById } from "./index";

// AYT subjects that belong to more than one field (Sayısal / Eşit Ağırlık / Sözel). Each field has its OWN course object for such a
// subject (lib/curriculum/ayt-*.json) -- "ayt-matematik-sayisal" and "ayt-matematik-ea" -- with the same topics in the same order, so
// each field's tab lists it. But a student's question statistics (student_topic_stats) are saved under the course id the task was
// assigned with, so numbers recorded under one field's course (a Sayısal-tagged Matematik task of an EA student) showed up in that
// field's tab only. (Topic ids are not always shared between the courses -- Geometri and every "(Genel)" master carry the course in
// their id -- so topics are matched by their position and name, not by id.)
//
// The shared subjects, per the YKS curriculum:
//   - Matematik, Geometri: Sayısal + Eşit Ağırlık
//   - Edebiyat, Tarih 1, Coğrafya 1: Eşit Ağırlık + Sözel
// A table of any course in a group shows the statistics of ALL the group's courses, summed per topic. This is display-only: nothing is
// moved or rewritten, every stat stays stored under its own course id, and the page's grand total still counts each task once.
export const SIBLING_COURSE_GROUPS: readonly (readonly string[])[] = [
  ["ayt-matematik-sayisal", "ayt-matematik-ea"],
  ["ayt-geometri-sayisal", "ayt-geometri-ea"],
  ["ayt-edebiyat-ea", "ayt-edebiyat-sozel"],
  ["ayt-tarih-1-ea", "ayt-tarih-1-sozel"],
  ["ayt-cografya-1-ea", "ayt-cografya-1-sozel"],
];


type Stat = { total: number; correct: number; wrong: number; empty: number };
type CourseStats = { byTopic: Record<string, Stat>; karma: Stat };

// The other courses of the same shared subject (not including the course itself); [] for any course that is not shared.
export function siblingCourseIds(courseId: string): string[] {
  const group = SIBLING_COURSE_GROUPS.find((g) => g.includes(courseId));
  return group ? group.filter((id) => id !== courseId) : [];
}

// sibling topic id -> the same topic's id in `courseId` (matched by position, and only where the names agree, so a drifted curriculum can
// never put a number on the wrong topic).
function topicIdMap(fromCourseId: string, toCourseId: string): Map<string, string> {
  const map = new Map<string, string>();
  const from = findCourseById(fromCourseId)?.units.flatMap((u) => u.topics);
  const to = findCourseById(toCourseId)?.units.flatMap((u) => u.topics);
  if (!from || !to) return map;
  from.forEach((topic, i) => {
    if (to[i] && to[i].name === topic.name) map.set(topic.id, to[i].id);
  });
  return map;
}

function add(a: Stat, b: Stat): Stat {
  return { total: a.total + b.total, correct: a.correct + b.correct, wrong: a.wrong + b.wrong, empty: a.empty + b.empty };
}

// The statistics a course's table shows: its own plus its siblings', summed per topic (matched across the group by position and name)
// and for the Karma row. A course with no siblings, or siblings with nothing recorded, gets its own object back untouched.
export function mergeSiblingTopicStats<T extends CourseStats>(courseId: string, statsOf: (id: string) => T | undefined, own: T): T {
  const siblings = siblingCourseIds(courseId)
    .map((id) => ({ id, stats: statsOf(id) }))
    .filter((s): s is { id: string; stats: T } => !!s.stats);
  if (siblings.length === 0) return own;
  const byTopic: Record<string, Stat> = { ...own.byTopic };
  let karma = own.karma;
  for (const sibling of siblings) {
    const ids = topicIdMap(sibling.id, courseId);
    for (const [siblingTopicId, stat] of Object.entries(sibling.stats.byTopic)) {
      const topicId = ids.get(siblingTopicId);
      if (!topicId) continue;
      byTopic[topicId] = byTopic[topicId] ? add(byTopic[topicId], stat) : stat;
    }
    karma = add(karma, sibling.stats.karma);
  }
  return { ...own, byTopic, karma };
}
