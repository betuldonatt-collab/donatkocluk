// 7th grade ("Türkiye Yüzyılı Maarif Modeli") curriculum -- a PLACEHOLDER, on purpose.
//
// The 7th grade is a full grade of the platform (profiles.is_maarif7, migration 0119) but its
// Kaynak Takibi / Konu Çalışması / Deneme Analizi data has not been supplied yet. Until it is,
// MAARIF7_KAYNAK_COURSES is empty, the same Course[] shape as ./maarif9, ./maarif10 and
// ./maarif11, so the real data drops in (a maarif7.json run through withCleanNames, like the
// other grades) with no change anywhere else: every consumer of MAARIF_GRADES[7] already
// shows a calm "ders listesi hazırlandığında burada görünecek" state for an empty list.
//
// Course ids will all start with "maarif7-" (isMaarif7CourseId), so a 7th grader can only ever
// be offered 7th-grade courses. There is no Çıkmış Sorular data for the 7th grade, and none is
// wanted (no national exam), so that page stays hidden for it.
import type { Course } from "./index";

export const MAARIF7_KAYNAK_COURSES: Course[] = [];

export function isMaarif7CourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif7-");
}
