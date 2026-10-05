// "Yazılılar": a student's school-exam grades, per course, per term, per yazılı.
// Pure rules shared by the page, the server actions and the tests: which default
// courses a grade has, the pastel colour palette, and how a typed grade is read.

export type SchoolCohort = "grade7" | "lgs" | "grade9" | "grade10" | "grade11" | "grade12";

export type SchoolCourseDef = { key: string; name: string };

export const COHORT_LABELS: Record<SchoolCohort, string> = {
  grade7: "7. Sınıf",
  lgs: "8. Sınıf",
  grade9: "9. Sınıf",
  grade10: "10. Sınıf",
  grade11: "11. Sınıf",
  grade12: "12. Sınıf",
};

// The default courses of each grade, exactly as the coach specified them -- not
// filtered by track (a Sayısal student still has Tarih and Coğrafya exams). A
// student drops one they do not take with a removal request the coach approves.
const MAARIF_BASE: SchoolCourseDef[] = [
  { key: "matematik", name: "Matematik" },
  { key: "fizik", name: "Fizik" },
  { key: "kimya", name: "Kimya" },
  { key: "biyoloji", name: "Biyoloji" },
  { key: "ingilizce", name: "İngilizce (Birinci Yabancı Dil)" },
  { key: "almanca", name: "Almanca (İkinci Yabancı Dil)" },
  { key: "edebiyat", name: "Türk Dili ve Edebiyatı" },
  { key: "tarih", name: "Tarih" },
  { key: "cografya", name: "Coğrafya" },
  { key: "din", name: "Din Kültürü ve Ahlak Bilgisi" },
];
const FELSEFE: SchoolCourseDef = { key: "felsefe", name: "Felsefe" };

export const DEFAULT_SCHOOL_COURSES: Record<SchoolCohort, SchoolCourseDef[]> = {
  grade7: [
    { key: "matematik", name: "Matematik" },
    { key: "turkce", name: "Türkçe" },
    { key: "fen", name: "Fen Bilimleri" },
    { key: "sosyal", name: "Sosyal Bilgiler" },
    { key: "ingilizce", name: "İngilizce" },
    { key: "din", name: "Din Kültürü ve Ahlak Bilgisi" },
  ],
  lgs: [
    { key: "matematik", name: "Matematik" },
    { key: "turkce", name: "Türkçe" },
    { key: "fen", name: "Fen Bilimleri" },
    { key: "inkilap", name: "TC İnkılap Tarihi ve Atatürkçülük" },
    { key: "ingilizce", name: "İngilizce" },
    { key: "din", name: "Din Kültürü ve Ahlak Bilgisi" },
  ],
  grade9: MAARIF_BASE,
  grade10: [...MAARIF_BASE, FELSEFE],
  grade11: [...MAARIF_BASE, FELSEFE],
  grade12: [...MAARIF_BASE, FELSEFE],
};

// Which school grade a student is in, from what the profile records. A graduate
// (Mezun) has none -- no school exams. LGS is the 8th grade; a Maarif flag is 7/9/10/11;
// every other YKS student is in the 12th grade.
export function schoolCohortOf(student: {
  examType: "YKS" | "LGS";
  maarifGrade: 7 | 9 | 10 | 11 | null;
  isGraduate: boolean;
}): SchoolCohort | null {
  if (student.isGraduate) return null;
  if (student.examType === "LGS") return "lgs";
  if (student.maarifGrade === 7) return "grade7";
  if (student.maarifGrade === 9) return "grade9";
  if (student.maarifGrade === 10) return "grade10";
  if (student.maarifGrade === 11) return "grade11";
  return "grade12";
}

export function isDefaultCourseKey(cohort: SchoolCohort, key: string): boolean {
  return DEFAULT_SCHOOL_COURSES[cohort].some((c) => c.key === key);
}

export function defaultCourseName(cohort: SchoolCohort, key: string): string | null {
  return DEFAULT_SCHOOL_COURSES[cohort].find((c) => c.key === key)?.name ?? null;
}

// --- Colours ---------------------------------------------------------------
// Pastel tones only, to sit with the rest of the platform. Class strings are
// written out in full so Tailwind sees them.
export type SchoolColor = {
  key: string;
  label: string;
  header: string;
  body: string;
  border: string;
  swatch: string;
};

export const SCHOOL_COLORS: SchoolColor[] = [
  { key: "pembe", label: "Pembe", header: "bg-pink-200 text-pink-950 dark:bg-pink-900/50 dark:text-pink-50", body: "bg-pink-50 dark:bg-pink-950/25", border: "border-pink-300 dark:border-pink-800", swatch: "bg-pink-300" },
  { key: "mavi", label: "Mavi", header: "bg-sky-200 text-sky-950 dark:bg-sky-900/50 dark:text-sky-50", body: "bg-sky-50 dark:bg-sky-950/25", border: "border-sky-300 dark:border-sky-800", swatch: "bg-sky-300" },
  { key: "yesil", label: "Yeşil", header: "bg-green-200 text-green-950 dark:bg-green-900/50 dark:text-green-50", body: "bg-green-50 dark:bg-green-950/25", border: "border-green-300 dark:border-green-800", swatch: "bg-green-300" },
  { key: "sari", label: "Sarı", header: "bg-amber-200 text-amber-950 dark:bg-amber-900/50 dark:text-amber-50", body: "bg-amber-50 dark:bg-amber-950/25", border: "border-amber-300 dark:border-amber-800", swatch: "bg-amber-300" },
  { key: "mor", label: "Mor", header: "bg-violet-200 text-violet-950 dark:bg-violet-900/50 dark:text-violet-50", body: "bg-violet-50 dark:bg-violet-950/25", border: "border-violet-300 dark:border-violet-800", swatch: "bg-violet-300" },
  { key: "turuncu", label: "Turuncu", header: "bg-orange-200 text-orange-950 dark:bg-orange-900/50 dark:text-orange-50", body: "bg-orange-50 dark:bg-orange-950/25", border: "border-orange-300 dark:border-orange-800", swatch: "bg-orange-300" },
  { key: "bej", label: "Bej", header: "bg-stone-300 text-stone-900 dark:bg-stone-700/60 dark:text-stone-50", body: "bg-stone-100 dark:bg-stone-900/30", border: "border-stone-400 dark:border-stone-600", swatch: "bg-stone-400" },
  { key: "kirmizi", label: "Kırmızı", header: "bg-rose-200 text-rose-950 dark:bg-rose-900/50 dark:text-rose-50", body: "bg-rose-50 dark:bg-rose-950/25", border: "border-rose-300 dark:border-rose-800", swatch: "bg-rose-300" },
  { key: "turkuaz", label: "Turkuaz", header: "bg-teal-200 text-teal-950 dark:bg-teal-900/50 dark:text-teal-50", body: "bg-teal-50 dark:bg-teal-950/25", border: "border-teal-300 dark:border-teal-800", swatch: "bg-teal-300" },
  { key: "gri", label: "Gri-Mavi", header: "bg-slate-300 text-slate-900 dark:bg-slate-700/60 dark:text-slate-50", body: "bg-slate-100 dark:bg-slate-900/30", border: "border-slate-400 dark:border-slate-600", swatch: "bg-slate-400" },
];

export const SCHOOL_COLOR_KEYS = SCHOOL_COLORS.map((c) => c.key);

export function isSchoolColorKey(key: unknown): key is string {
  return typeof key === "string" && SCHOOL_COLOR_KEYS.includes(key);
}

export function schoolColor(key: string | null | undefined, fallbackIndex: number): SchoolColor {
  return (
    SCHOOL_COLORS.find((c) => c.key === key) ?? SCHOOL_COLORS[((fallbackIndex % SCHOOL_COLORS.length) + SCHOOL_COLORS.length) % SCHOOL_COLORS.length]
  );
}

// --- Grades ----------------------------------------------------------------
export const TERMS = [1, 2] as const;
export const EXAM_NOS = [1, 2] as const;
export type Term = (typeof TERMS)[number];
export type ExamNo = (typeof EXAM_NOS)[number];

export const TERM_LABELS: Record<Term, string> = { 1: "1. Dönem", 2: "2. Dönem" };
export const EXAM_LABELS: Record<ExamNo, string> = { 1: "I. Yazılı", 2: "II. Yazılı" };

export const MAX_CUSTOM_COURSES = 30;
export const MAX_COURSE_NAME_LENGTH = 60;

export type ParsedGrade = { ok: true; value: number | null } | { ok: false; error: string };

// What a student typed into a grade box: empty = no grade; otherwise 0-100 with at
// most two decimals, a comma or a dot as the separator ("85", "85,5", "85.25").
export function parseGrade(raw: string): ParsedGrade {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(text)) return { ok: false, error: "0 ile 100 arasında bir not gir." };
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false, error: "Not 0 ile 100 arasında olmalı." };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

// How a stored grade is shown back in its box ("85,5").
export function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

export type CourseNameCheck = { ok: true; name: string } | { ok: false; error: string };

export function checkCourseName(raw: string): CourseNameCheck {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") return { ok: false, error: "Ders adı boş olamaz." };
  if (name.length > MAX_COURSE_NAME_LENGTH) return { ok: false, error: `Ders adı en fazla ${MAX_COURSE_NAME_LENGTH} karakter olabilir.` };
  return { ok: true, name };
}

export type RemovalStatus = "none" | "pending" | "rejected";
