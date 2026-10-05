import type { ExamType } from "@/lib/exam-type";
import type { MaarifGrade } from "@/lib/maarif-grade";

// The "Rutin Türü" choices offered when a coach assigns a routine (the daily
// practice lane above the regular tasks), per cohort -- see routineOptionsFor.
export type RoutineType = "paragraf" | "problem" | "kitap-okuma" | "yeni-nesil-mat-dozu" | "diger";

export const ROUTINE_TYPE_OPTIONS: { value: RoutineType; label: string }[] = [
  { value: "paragraf", label: "Paragraf" },
  { value: "problem", label: "Problem" },
  { value: "kitap-okuma", label: "Kitap Okuma" },
  { value: "yeni-nesil-mat-dozu", label: "Yeni Nesil Mat Dozu" },
  { value: "diger", label: "Diğer" },
];

// Problem is a YKS-only practice and Yeni Nesil Mat Dozu an LGS-only one, so
// each cohort's Rutin Türü row omits the other's. A 7th grader follows the LGS structure for Paragraf / Kitap
// Okuma (no Problem), and has no Yeni Nesil Mat Dozu either.
export function routineOptionsFor(examType: ExamType, maarifGrade: MaarifGrade | null = null) {
  if (maarifGrade === 7) return ROUTINE_TYPE_OPTIONS.filter((o) => o.value !== "problem" && o.value !== "yeni-nesil-mat-dozu");
  return ROUTINE_TYPE_OPTIONS.filter((o) => (examType === "LGS" ? o.value !== "problem" : o.value !== "yeni-nesil-mat-dozu"));
}

// A routine whose task is just a course id (no dedicated task type):
// Paragraf, Problem and Yeni Nesil Mat Dozu are all "Soru Çözümü" practice
// under their pseudo-course. Kitap Okuma is the one routine with its own task
// type (reading), and "Diğer" is the normal form again.
export function isCourseRoutine(type: RoutineType): type is "paragraf" | "problem" | "yeni-nesil-mat-dozu" {
  return type === "paragraf" || type === "problem" || type === "yeni-nesil-mat-dozu";
}
