// The overall "Program Tamamlama" bars of the coach's student detail page: which bars a student sees and which tasks each one counts.
//
// The standard layout (a YKS student -- 12th graders and Mezun included) is Toplam + TYT + AYT, computed by the page itself. Every other
// cohort gets bars that mean something for it, so nobody stares at two permanently empty TYT / AYT lines:
//
//   Maarif 11   Toplam + "Maarif TYT" (the merged 9th + 10th grade courses, the Maarif TYT Genel Deneme, and 9th / 10th grade Genel
//               Denemeler) + "11. Sınıf" (its own courses and own Genel Deneme)
//   Maarif 10   Toplam + "9. Sınıf" + "10. Sınıf"
//   Maarif 9    one bar, "9. Sınıf", over ALL of its progress (no separate Toplam)
//   Maarif 7    Toplam only
//   LGS         Toplam + "Sözel" + "Sayısal"
//
// A Mezun is a plain YKS student (the admin clears every Maarif flag when marking one), and a 12th grader never had one, so
// "maarifGrade 9 / 10 / 11" alone selects the Maarif layouts. A task joins a bar by its course, or -- a Genel Deneme having no
// course -- by the track in its title (lib/general-exam-track.ts). A task that fits no bar (Kitap Okuma, a free study entry) is
// in Toplam only, as it always was for TYT / AYT.
import { completionPercent } from "./completion";
import { YENI_NESIL_MAT_DOZU_ID } from "./curriculum";
import { weightedCounts, type WeightableTask } from "./effort-weight";
import { LGS_SUBJECT_GROUPS } from "./curriculum/subject-groups";
import { parseGeneralExamTrack, type GeneralExamTrack } from "./general-exam-track";
import type { ExamType } from "./exam-type";
import type { MaarifGrade } from "./maarif-grade";

// A task row as the bars read it: what taskWeight / taskCredit need (lib/effort-weight.ts) plus its course and title for the matching.
export type CompletionTask = WeightableTask;

export type CompletionBarDef = { key: string; label: string; matches: Matcher };

export type CompletionLayout =
  // Toplam + TYT + AYT, as before (the page computes these).
  | { kind: "standard" }
  // Toplam (when showOverall) + these bars.
  | { kind: "groups"; showOverall: boolean; bars: CompletionBarDef[] };

export type CompletionGroupStat = { key: string; label: string; weekly: number | null; allTime: number | null };

type Matcher = (t: Omit<CompletionTask, "status">) => boolean;

const courseStartsWith = (prefix: string): Matcher => (t) => !!t.course_id?.startsWith(prefix);

const generalTrackIn = (tracks: GeneralExamTrack[]): Matcher => (t) =>
  t.task_type === "general_exam" && tracks.includes(parseGeneralExamTrack(t.title ?? ""));

const anyOf =
  (...fns: Matcher[]): Matcher =>
  (t) =>
    fns.some((fn) => fn(t));

const LGS_SOZEL_COURSES = new Set([...(LGS_SUBJECT_GROUPS.find((g) => g.key === "sozel")?.courseIds ?? []), "paragraf", "ingilizce-quiz"]);
const LGS_SAYISAL_COURSES = new Set([...(LGS_SUBJECT_GROUPS.find((g) => g.key === "sayisal")?.courseIds ?? []), "problem", YENI_NESIL_MAT_DOZU_ID]);

// An LGS Genel Deneme covers both sessions, so it counts toward both bars; the routines go with their subject (Paragraf and the
// İngilizce Kelime Quizi -> Sözel; Problem and Yeni Nesil Mat Dozu -> Sayısal).
const lgsGeneral = generalTrackIn(["lgs"]);
const LGS_BARS: CompletionBarDef[] = [
  { key: "sozel", label: "Sözel", matches: (t) => lgsGeneral(t) || (!!t.course_id && LGS_SOZEL_COURSES.has(t.course_id)) },
  { key: "sayisal", label: "Sayısal", matches: (t) => lgsGeneral(t) || (!!t.course_id && LGS_SAYISAL_COURSES.has(t.course_id)) },
];

const MAARIF_BARS = {
  mtyt: { key: "mtyt", label: "Maarif TYT", matches: anyOf(courseStartsWith("maarif-tyt-"), generalTrackIn(["mtyt", "m9", "m10"])) },
  m11: { key: "m11", label: "11. Sınıf", matches: anyOf(courseStartsWith("maarif11-"), generalTrackIn(["m11"])) },
  m10: { key: "m10", label: "10. Sınıf", matches: anyOf(courseStartsWith("maarif10-"), generalTrackIn(["m10"])) },
  m9: { key: "m9", label: "9. Sınıf", matches: anyOf(courseStartsWith("maarif9-"), generalTrackIn(["m9"])) },
} satisfies Record<string, CompletionBarDef>;

export function completionLayoutFor(input: { examType: ExamType; maarifGrade: MaarifGrade | null }): CompletionLayout {
  if (input.examType === "LGS") return { kind: "groups", showOverall: true, bars: LGS_BARS };
  switch (input.maarifGrade) {
    case 11:
      return { kind: "groups", showOverall: true, bars: [MAARIF_BARS.mtyt, MAARIF_BARS.m11] };
    case 10:
      return { kind: "groups", showOverall: true, bars: [MAARIF_BARS.m9, MAARIF_BARS.m10] };
    case 9:
      // one bar over everything the 9th grader did -- there is no other track to split it from
      return { kind: "groups", showOverall: false, bars: [{ key: "m9", label: "9. Sınıf", matches: () => true }] };
    case 7:
      return { kind: "groups", showOverall: true, bars: [] };
    default:
      return { kind: "standard" };
  }
}

// The bar's percentage, on the same effort-weighted math as every other bar in the app (lib/effort-weight.ts): the weight of every task
// the bar counts is the denominator, the weight each has earned (all of it when done, solved / target of it when half done) the
// numerator. Null when the bar counts nothing (nothing due -> "—", never 0%).
export function percentForBar(tasks: CompletionTask[], bar: CompletionBarDef): number | null {
  return completionPercent(weightedCounts(tasks.filter((t) => bar.matches(t))));
}

export function groupStats(layout: CompletionLayout, weeklyTasks: CompletionTask[], allTimeTasks: CompletionTask[]): CompletionGroupStat[] {
  if (layout.kind !== "groups") return [];
  return layout.bars.map((bar) => ({
    key: bar.key,
    label: bar.label,
    weekly: percentForBar(weeklyTasks, bar),
    allTime: percentForBar(allTimeTasks, bar),
  }));
}
