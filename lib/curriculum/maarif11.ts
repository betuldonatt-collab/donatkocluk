// 11th grade ("Türkiye Yüzyılı Maarif Modeli") curriculum constants -- same
// shape as maarif9.ts/maarif10.ts's own *_KAYNAK_COURSES (Course[]), so this
// file can be swapped from scaffolding to real generated data later with no
// changes needed anywhere else that consumes it.
//
// MAARIF11_KAYNAK_COURSES is empty until the real curriculum content is
// provided. MAARIF11_COURSE_TRACKS maps each (future) course id to the AYT
// track(s) it belongs to, for the "11. Sınıf" Kaynak Takibi tab's one-click
// Sayısal/EA/Sözel switcher (components/course-tabs.tsx) -- a subject can
// belong to more than one track (Matematik is both Sayısal and EA, for
// example), same as the real exam structure. Fill this in alongside the
// real course ids once they exist; until then there's nothing to tag.
import type { Course } from "./index";

export type Maarif11Track = "sayisal" | "ea" | "sozel";

export const MAARIF11_KAYNAK_COURSES: Course[] = [];

export const MAARIF11_COURSE_TRACKS: Record<string, Maarif11Track[]> = {};

export function tracksForMaarif11Course(courseId: string): Maarif11Track[] {
  return MAARIF11_COURSE_TRACKS[courseId] ?? [];
}

export function isMaarif11CourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif11-");
}
