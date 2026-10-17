import { isSoruCozumuLike } from "./task-types";

// Which pool of a course's resources (kaynaklar) a task type picks from. The coach's form keeps the chosen resources when the Görev Türü
// changes to another type of the SAME pool, and clears them only when the new type cannot use them:
//   "study"  Soru Çözümü, Kaynak Taraması, Konu Çalışması / Video (the legacy "video" too) -- a course's plain study resources (0044)
//   "branch" Branş Denemesi -- the course's branch-trial inventory (and the publisher), a different list
//   null     Genel Deneme, Kitap Okuma, İngilizce Kelime Quizi, ... -- no resources at all
export type ResourcePool = "study" | "branch";

export function resourcePoolOf(taskType: string | null | undefined): ResourcePool | null {
  if (isSoruCozumuLike(taskType) || taskType === "topic_study" || taskType === "video") return "study";
  if (taskType === "branch_exam") return "branch";
  return null;
}

// The resource rows the form holds after the Görev Türü changes from `from` to `to`.
//  - same pool (Soru Çözümü <-> Konu Çalışması / Video <-> Kaynak Taraması): kept exactly as they are;
//  - a type that uses no resources: cleared, so no hidden data stays in the payload;
//  - the other pool (study <-> Branş Denemesi, whose list is a different one): cleared -- Branş Denemesi starts with one empty row, the
//    field its publisher is typed into, so it is visible straight away.
export function resourcesAfterTaskTypeChange<R>(from: string, to: string, current: R[], emptyRow: () => R): R[] {
  const next = resourcePoolOf(to);
  if (next === null) return [];
  if (next === resourcePoolOf(from)) return current;
  return next === "branch" ? [emptyRow()] : [];
}
