// Generated from the official curriculum workbooks by
// scripts/parse-curriculum.mjs — do not hand-edit the JSON files; re-run
// the script instead. See lib/curriculum/*.json.
import tytJson from "./tyt.json";
import aytSayisalJson from "./ayt-sayisal.json";
import aytEaJson from "./ayt-ea.json";
import aytSozelJson from "./ayt-sozel.json";
// lgs.json is generated once from the "8. Sınıf - Taslak Dosyası" workbook's
// Kaynak Takibi sheet (not by parse-curriculum.mjs) -- same shape, plus the
// optional `konu` level below.
import lgsJson from "./lgs.json";

import { MAARIF9_GENEL_DENEME_COURSES, MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_GENEL_DENEME_COURSES, MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF7_KAYNAK_COURSES } from "./maarif7";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { lgsSelectionNodes } from "./lgs-selection";
import { stripKonuNumberPrefix } from "./topic-name";

export type Topic = { id: string; name: string; frequency?: Record<string, number> };
// `konu` is LGS's middle hierarchy level (Ünite -> Konu -> Alt Konu):
// Matematik (and one Fen ünite) track progress at the Alt Konu level, so
// each (unit, konu) pair is its own entry here with Alt Konu leaves as its
// topics. Everywhere else in LGS -- and all of YKS -- Konu itself is the
// leaf and this stays undefined, so every existing consumer that only
// reads `unit`/`topics` keeps working unchanged.
// `bucket` marks a unit entry that is ONE tracked leaf in the UI (the 11th
// grade's "Maarif TYT" Coğrafya/Tarih, lib/curriculum/maarif-tyt-structure.ts):
// the tables show only this label, never the raw `topics` it rolls up -- those
// stay here (real ids, real names) purely so progress and mistakes can still be
// saved and aggregated against them.
// `group` is a bucket's INTERMEDIATE heading inside its unit (Kimya: Tema ->
// "Kimya Hayattır" -> bucket): shown once as a heading row above its buckets.
export type Unit = { unit: string; konu?: string; bucket?: string; group?: string; topics: Topic[] };
export type Course = { id: string; name: string; units: Unit[] };

export const TYT_COURSES: Course[] = tytJson as Course[];

// LGS (8th grade) subjects -- ids are all "lgs-" prefixed so they can never
// collide with, or be mistaken for, a tyt-/ayt- course.
// The sheet's Konu numbering ("1.1 Çarpanlar ve Katlar") is stripped here so
// no screen shows it (see ./topic-name); the JSON keeps it for ordering.
export const LGS_COURSES: Course[] = (lgsJson as Course[]).map((course) => ({
  ...course,
  units: course.units.map((u) => (u.konu === undefined ? u : { ...u, konu: stripKonuNumberPrefix(u.konu) })),
}));

export function isLgsCourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("lgs-");
}

export type Track = "sayisal" | "ea" | "sozel";

export const TRACK_LABELS: Record<Track, string> = {
  sayisal: "Sayısal",
  ea: "Eşit Ağırlık",
  sozel: "Sözel",
};

export const AYT_COURSES_BY_TRACK: Record<Track, Course[]> = {
  sayisal: aytSayisalJson as Course[],
  ea: aytEaJson as Course[],
  sozel: aytSozelJson as Course[],
};

// Synthetic, non-curriculum "courses" for the coach's daily routines --
// Paragraf, Problem, Kitap Okuma and Yeni Nesil Mat Dozu practice aren't tied
// to a specific curriculum subject, so each gets its own pseudo-course entry
// (empty unit list, which makes topicsForCourse() correctly offer only "Karma"
// for them) rather than being force-mapped onto e.g. TYT Türkçe. Problem is
// YKS-only and Yeni Nesil Mat Dozu (the LGS "new generation" math question
// dose) is LGS-only; the coach's pickers filter accordingly.
export const YENI_NESIL_MAT_DOZU_ID = "yeni-nesil-mat-dozu";

export const ROUTINE_COURSES: Course[] = [
  { id: "paragraf", name: "Paragraf", units: [] },
  { id: "problem", name: "Problem", units: [] },
  { id: "kitap-okuma", name: "Kitap Okuma", units: [] },
  { id: YENI_NESIL_MAT_DOZU_ID, name: "Yeni Nesil Mat Dozu", units: [] },
];

export function isRoutineCourseId(courseId: string | null | undefined): boolean {
  return (
    courseId === "paragraf" ||
    courseId === "problem" ||
    courseId === "kitap-okuma" ||
    courseId === YENI_NESIL_MAT_DOZU_ID
  );
}

// "Whole fruit" branch-exam subjects, coexisting alongside (never
// replacing) the "sliced" atomic subjects they're built from -- a coach
// can assign, and a student/coach can independently track, either a
// combined "TYT Fen" branch exam or a standalone "Fizik" one. Each
// macro course's units are one bucket per constituent atomic course
// (unit label = that course's own name), reusing the SAME topic ids the
// atomic course already has -- every mistake-aggregation view in this
// app keys by `${course_id}::${topic_id}` together, never topic_id
// alone, so a macro exam's mistakes stay fully independent of the
// atomic subject's own stats without needing to invent new topic ids.
// Deliberately its own list, not folded into TYT_COURSES/
// AYT_COURSES_BY_TRACK -- those feed every course picker in the app
// (Kaynak Takibi, Kaynak Kütüphanesi, general task assignment), where a
// combined subject doesn't make sense. Only the branch-exam-specific
// surfaces (see BRANCH_EXAM_MACRO_COURSES usages) opt in.
//
// TYT Türkçe has no macro entry -- it's already a single atomic subject
// with nothing to combine, so the existing tyt-turkce course IS the
// "whole" option.
function macroCourse(id: string, name: string, sourceCourses: Course[]): Course {
  return {
    id,
    name,
    units: sourceCourses.map((c) => ({ unit: c.name, topics: c.units.flatMap((u) => u.topics) })),
  };
}

function coursesById(courses: Course[], ids: string[]): Course[] {
  return ids.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c);
}

export const TYT_BRANCH_EXAM_MACRO_COURSES: Course[] = [
  macroCourse("tyt-sosyal-macro", "TYT Sosyal", coursesById(TYT_COURSES, ["tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"])),
  macroCourse("tyt-matematik-macro", "TYT Matematik", coursesById(TYT_COURSES, ["tyt-matematik", "tyt-geometri"])),
  macroCourse("tyt-fen-macro", "TYT Fen", coursesById(TYT_COURSES, ["tyt-fizik", "tyt-kimya", "tyt-biyoloji"])),
];

export const AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK: Record<Track, Course[]> = {
  sayisal: [
    macroCourse(
      "ayt-matematik-sayisal-macro",
      "AYT Matematik",
      coursesById(aytSayisalJson as Course[], ["ayt-matematik-sayisal", "ayt-geometri-sayisal"]),
    ),
    macroCourse("ayt-fen-sayisal-macro", "AYT Fen", coursesById(aytSayisalJson as Course[], ["ayt-fizik", "ayt-kimya", "ayt-biyoloji"])),
  ],
  ea: [
    macroCourse("ayt-matematik-ea-macro", "AYT Matematik", coursesById(aytEaJson as Course[], ["ayt-matematik-ea", "ayt-geometri-ea"])),
    macroCourse(
      "ayt-sos1-ea-macro",
      "AYT Sos 1",
      coursesById(aytEaJson as Course[], ["ayt-edebiyat-ea", "ayt-tarih-1-ea", "ayt-cografya-1-ea"]),
    ),
  ],
  sozel: [
    macroCourse(
      "ayt-sos1-sozel-macro",
      "AYT Sos 1",
      coursesById(aytSozelJson as Course[], ["ayt-edebiyat-sozel", "ayt-tarih-1-sozel", "ayt-cografya-1-sozel"]),
    ),
    macroCourse(
      "ayt-sos2-sozel-macro",
      "AYT Sos 2",
      coursesById(aytSozelJson as Course[], [
        "ayt-tarih-2",
        "ayt-cografya-2",
        "ayt-felsefe",
        "ayt-psikoloji",
        "ayt-sosyoloji",
        "ayt-mantik",
        "ayt-din-kulturu-ve-ahlak-bilgisi",
      ]),
    ),
  ],
};

export const BRANCH_EXAM_MACRO_COURSES: Course[] = [
  ...TYT_BRANCH_EXAM_MACRO_COURSES,
  ...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK.sayisal,
  ...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK.ea,
  ...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK.sozel,
];

// profiles.academic_track ("yks_sayisal" ...) as an AYT track; null for anything else (LGS, Maarif, YDT, unset).
export function aytTrackOf(academicTrack: string | null | undefined): Track | null {
  return academicTrack === "yks_sayisal" ? "sayisal" : academicTrack === "yks_ea" ? "ea" : academicTrack === "yks_sozel" ? "sozel" : null;
}

// A course's name as shown next to a task: the TYT / AYT atomic courses store a bare name ("Fizik") and show it
// with their exam prefix ("TYT Fizik"); the combined branch-exam courses ("TYT Fen", "AYT Matematik") already carry
// the prefix in their name and must not get it twice ("TYT TYT Fen"). Every place that builds or shows such a name
// goes through this one function, so the prefix can never double up -- whatever course it is.
export function courseDisplayName(courseId: string | null | undefined, name: string): string {
  // The 11th grade's merged 9th + 10th grade courses ("maarif-tyt-matematik", plain name "Matematik") read "Maarif TYT
  // Matematik", so they can never be mistaken for the grade's own "11. Sınıf Matematik".
  const prefix = courseId?.startsWith("tyt-")
    ? "TYT "
    : courseId?.startsWith("ayt-")
      ? "AYT "
      : courseId?.startsWith("maarif-tyt-")
        ? "Maarif TYT "
        : "";
  return prefix && !name.startsWith(prefix) ? prefix + name : name;
}

// Courses a task can be assigned from must be listed ONCE: AYT Matematik / Geometri exist for both Sayısal and EA, and
// AYT Edebiyat / Tarih 1 / Coğrafya 1 for both EA and Sözel, with the same name (and the same topics). The duplicate
// is dropped; where the student's own AYT track has a variant, that is the one kept (so an EA student's "AYT
// Matematik" is the EA course, which keeps their karne breakdown under the right track), otherwise the first.
export function dedupeCoursesByLabel(courses: Course[], aytTrack: Track | null = null): Course[] {
  const kept = new Map<string, Course>();
  const inTrack = (c: Course) =>
    aytTrack !== null && [...AYT_COURSES_BY_TRACK[aytTrack], ...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[aytTrack]].some((t) => t.id === c.id);
  for (const course of courses) {
    const label = courseDisplayName(course.id, course.name);
    const current = kept.get(label);
    if (!current || (inTrack(course) && !inTrack(current))) kept.set(label, course);
  }
  return [...kept.values()];
}

// The "Ders" options of a YKS student's task form (the coach's "Yeni görev ekle" and the student's "Ek Çalışma Ekle"):
// the combined branch-exam courses first (only for a Branş Denemesi), then the atomic ones -- each course once. A
// combined course whose name equals an atomic one's ("AYT Matematik" = Matematik + Geometri, vs. the Matematik
// course alone) is a different thing, so its label says what it combines.
export function yksCourseOptions(input: { atomic: Course[]; macros: Course[]; aytTrack: Track | null }): { id: string; label: string }[] {
  const atomicOptions = dedupeCoursesByLabel(input.atomic, input.aytTrack).map((c) => ({ id: c.id, label: courseDisplayName(c.id, c.name) }));
  const atomicLabels = new Set(atomicOptions.map((o) => o.label));
  const macroOptions = dedupeCoursesByLabel(input.macros, input.aytTrack).map((c) => {
    const label = courseDisplayName(c.id, c.name);
    return { id: c.id, label: atomicLabels.has(label) ? label + " (" + c.units.map((u) => u.unit).join(" + ") + ")" : label };
  });
  return [...macroOptions, ...atomicOptions];
}

export function isBranchExamMacroCourseId(courseId: string | null | undefined): boolean {
  return BRANCH_EXAM_MACRO_COURSES.some((c) => c.id === courseId);
}

const ALL_COURSES: Course[] = [
  ...TYT_COURSES,
  ...AYT_COURSES_BY_TRACK.sayisal,
  ...AYT_COURSES_BY_TRACK.ea,
  ...AYT_COURSES_BY_TRACK.sozel,
  ...LGS_COURSES,
  ...ROUTINE_COURSES,
  ...BRANCH_EXAM_MACRO_COURSES,
];

// Maarif (9th/10th/11th-grade, and the 11th grade's merged "Maarif TYT" tab)
// courses are looked up as a fallback only -- they are deliberately NOT
// part of ALL_COURSES, so no existing YKS/LGS list or picker that iterates
// ALL_COURSES can ever pick them up.
function findMaarif9Course(courseId: string): Course | null {
  // Lookup by id only (so any stored task resolves); WHICH grade's courses a
  // picker offers is decided by lib/maarif-grade.ts, never here.
  return (
    MAARIF9_KAYNAK_COURSES.find((c) => c.id === courseId) ??
    MAARIF9_GENEL_DENEME_COURSES.find((c) => c.id === courseId) ??
    MAARIF10_KAYNAK_COURSES.find((c) => c.id === courseId) ??
    MAARIF10_GENEL_DENEME_COURSES.find((c) => c.id === courseId) ??
    MAARIF11_KAYNAK_COURSES.find((c) => c.id === courseId) ??
    MAARIF7_KAYNAK_COURSES.find((c) => c.id === courseId) ??
    MAARIF_TYT_MERGED_COURSES.find((c) => c.id === courseId) ??
    null
  );
}

// Any Maarif-origin course id -- 9th/10th grade's own, the 11th grade's
// merged "Maarif TYT" tab, or 11th grade's own.
// Shared by lib/curriculum/rows.ts to decide whether a course rolls up to
// unit-level selection nodes (maarif-selection.ts) instead of rendering one
// row per raw topic.
export function isMaarifCourseId(courseId: string | null | undefined): boolean {
  return (
    !!courseId &&
    (courseId.startsWith("maarif7-") ||
      courseId.startsWith("maarif9-") ||
      courseId.startsWith("maarif10-") ||
      courseId.startsWith("maarif11-") ||
      courseId.startsWith("maarif-tyt-"))
  );
}

export function findCourseById(courseId: string | null | undefined): Course | null {
  if (!courseId) return null;
  return ALL_COURSES.find((c) => c.id === courseId) ?? findMaarif9Course(courseId);
}

// A synthetic, non-curriculum topic every course carries: assigning it
// means "mixed topics", to be broken down by the student per-topic when
// they evaluate the task (see student_task_topic_breakdown).
export const KARMA_TOPIC_ID = "karma";
export const KARMA_TOPIC: Topic = { id: KARMA_TOPIC_ID, name: "Karma" };

export function topicsForCourse(course: Course): Topic[] {
  return [...course.units.flatMap((u) => u.topics), KARMA_TOPIC];
}

// Same list topicsForCourse gives, shaped for a combobox -- with one
// difference: an LGS Alt Konu leaf ("EKOK") is meaningless on its own, so
// it's labeled with its Konu ("1.1 Çarpanlar ve Katlar › EKOK"). Every
// course without a `konu` level (all of YKS) gets its plain topic name,
// exactly as before.
//
// `course` can genuinely be missing: a caller whose own course list comes
// from a cohort with no curriculum data (or a track with no subjects yet)
// has nothing to fall back to and ends up passing undefined here. No topic options at all, rather
// than throwing on course.id -- the form's own topic picker just shows
// none, matching "no course selected yet".
export function topicOptionsForCourse(course: Course | null | undefined): { id: string; label: string }[] {
  if (!course) return [];
  if (isLgsCourseId(course.id)) {
    return [
      ...lgsSelectionNodes(course).map((n) => ({ id: n.id, label: n.label })),
      { id: KARMA_TOPIC.id, label: KARMA_TOPIC.name },
    ];
  }
  return [
    ...course.units.flatMap((u) => u.topics.map((t) => ({ id: t.id, label: u.konu ? `${u.konu} › ${t.name}` : t.name }))),
    { id: KARMA_TOPIC.id, label: KARMA_TOPIC.name },
  ];
}

export function findTopicById(courseId: string | null | undefined, topicId: string | null | undefined): Topic | null {
  if (!topicId) return null;
  if (topicId === KARMA_TOPIC_ID) return KARMA_TOPIC;
  const course = findCourseById(courseId);
  if (!course) return null;
  // An LGS course's selection nodes are checked first: a rolled-up node's
  // id IS a real topic id (see lib/curriculum/lgs-selection.ts), so this
  // would otherwise resolve to that one specific Alt Konu's own name (e.g.
  // "EKOK") instead of the group label a coach actually picked ("1.1
  // Çarpanlar ve Katlar"). Falls through to the raw topic list for any
  // other real id (a non-representative member from before this change,
  // or a non-LGS course), so no historical row ever fails to resolve.
  if (isLgsCourseId(course.id)) {
    const node = lgsSelectionNodes(course).find((n) => n.id === topicId);
    if (node) return { id: node.id, name: node.label };
  }
  return course.units.flatMap((u) => u.topics).find((t) => t.id === topicId) ?? null;
}

// Turkish-insensitive search normalization: lowercases and strips the
// Turkish-specific diacritics/dotting so "sozel" matches "Sözel" and
// "cografya" matches "Coğrafya", not just literal-accent matches.
export function normalizeTr(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

// toTurkishTitleCase lives in ./topic-name (it is needed while the Maarif data
// loads, before this module has finished evaluating) and is re-exported here.
export { toTurkishTitleCase } from "./topic-name";
