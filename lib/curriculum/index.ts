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

export type Topic = { id: string; name: string; frequency?: Record<string, number> };
// `konu` is LGS's middle hierarchy level (Ünite -> Konu -> Alt Konu):
// Matematik (and one Fen ünite) track progress at the Alt Konu level, so
// each (unit, konu) pair is its own entry here with Alt Konu leaves as its
// topics. Everywhere else in LGS -- and all of YKS -- Konu itself is the
// leaf and this stays undefined, so every existing consumer that only
// reads `unit`/`topics` keeps working unchanged.
export type Unit = { unit: string; konu?: string; topics: Topic[] };
export type Course = { id: string; name: string; units: Unit[] };

export const TYT_COURSES: Course[] = tytJson as Course[];

// LGS (8th grade) subjects -- ids are all "lgs-" prefixed so they can never
// collide with, or be mistaken for, a tyt-/ayt- course.
export const LGS_COURSES: Course[] = lgsJson as Course[];

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

// 9th-grade (Maarif) courses are looked up as a fallback only -- they are
// deliberately NOT part of ALL_COURSES, so no existing YKS/LGS list or picker
// that iterates ALL_COURSES can ever pick them up.
function findMaarif9Course(courseId: string): Course | null {
  return MAARIF9_KAYNAK_COURSES.find((c) => c.id === courseId) ?? MAARIF9_GENEL_DENEME_COURSES.find((c) => c.id === courseId) ?? null;
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
export function topicOptionsForCourse(course: Course): { id: string; label: string }[] {
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
