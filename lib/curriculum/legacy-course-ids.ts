// The AYT subjects that used to exist once per field -- "ayt-matematik-sayisal" and "ayt-matematik-ea", "ayt-edebiyat-ea" and
// "ayt-edebiyat-sozel", ... -- are now ONE course each (lib/curriculum/ayt-shared.json) with one set of topic ids. Migration 0133
// moved every stored record (tasks, stats, mistakes, ticks, resources) to the new ids; this is the map between the two worlds, kept for
// data that is deliberately NOT rewritten: the archived Karne snapshots (student_report_cards.topic_mistakes), which keep the ids they
// were saved with and are read through these functions.

// old course id -> unified course id (regular courses and the two combined branch-exam "AYT" courses)
export const LEGACY_COURSE_ID_MAP: Readonly<Record<string, string>> = {
  "ayt-matematik-sayisal": "ayt-matematik",
  "ayt-matematik-ea": "ayt-matematik",
  "ayt-geometri-sayisal": "ayt-geometri",
  "ayt-geometri-ea": "ayt-geometri",
  "ayt-edebiyat-ea": "ayt-edebiyat",
  "ayt-edebiyat-sozel": "ayt-edebiyat",
  "ayt-tarih-1-ea": "ayt-tarih-1",
  "ayt-tarih-1-sozel": "ayt-tarih-1",
  "ayt-cografya-1-ea": "ayt-cografya-1",
  "ayt-cografya-1-sozel": "ayt-cografya-1",
  "ayt-matematik-sayisal-macro": "ayt-matematik-macro",
  "ayt-matematik-ea-macro": "ayt-matematik-macro",
  "ayt-sos1-ea-macro": "ayt-sos1-macro",
  "ayt-sos1-sozel-macro": "ayt-sos1-macro",
};

export function canonicalCourseId(courseId: string): string {
  return LEGACY_COURSE_ID_MAP[courseId] ?? courseId;
}

// Topic ids carried the old course id in the cases where they were not shared: every "(Genel)" master ("ayt-matematik-sayisal-genel-u1")
// and all of Geometri ("ayt-geometri-ea-u0-t0"); the plain topics of the other subjects ("ayt-matematik-u0-t0") were already the same.
// Only the regular courses' ids can prefix a topic id (a macro course's topics are its sources' topics).
const TOPIC_PREFIXES: [string, string][] = Object.entries(LEGACY_COURSE_ID_MAP)
  .filter(([old]) => !old.endsWith("-macro"))
  .map(([old, unified]) => [`${old}-`, `${unified}-`]);

export function canonicalTopicId(topicId: string): string {
  for (const [oldPrefix, newPrefix] of TOPIC_PREFIXES) {
    if (topicId.startsWith(oldPrefix)) return newPrefix + topicId.slice(oldPrefix.length);
  }
  return topicId;
}
