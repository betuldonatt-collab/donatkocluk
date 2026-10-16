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
import { YENI_NESIL_MAT_DOZU_ID } from "./curriculum";
import { LGS_SUBJECT_GROUPS } from "./curriculum/subject-groups";
import { parseGeneralExamTrack, type GeneralExamTrack } from "./general-exam-track";
import type { ExamType } from "./exam-type";
import type { MaarifGrade } from "./maarif-grade";

export type CompletionTask = { task_type: string; title: string; course_id: string | null; status: string };

export type CompletionBarDef = { key: string; label: string; matches: (task: Omit<CompletionTask, "status">) => boolean };

export type CompletionLayout =
  // Toplam + TYT + AYT, as before (the page computes these).
  | { kind: "standard" }
  // Toplam (when showOverall) + these bars.
  | { kind: "groups"; showOverall: boolean; bars: CompletionBarDef[] };

export type CompletionGroupStat = { key: string; label: string; weekly: number | null; allTime: number | null };

const courseStartsWith = (prefix: string) => (t: Omit<CompletionTask, "status">) => !!t.course_id?.startsWith(prefix);

const generalTrackIn = (tracks: GeneralExamTrack[]) => (t: Omit<CompletionTask, "status">) =>
  t.task_type === "general_exam" && tracks.includes(parseGeneralExamTrack(t.title));

const anyOf =
  (...fns: ((t: Omit<CompletionTask, "status">) => boolean)[]) =>
  (t: Omit<CompletionTask, "status">) =>
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

// done / total of the tasks a bar counts, as a rounded percentage; null when it counts none (nothing due -> "—", never 0%).
export function percentForBar(tasks: CompletionTask[], bar: CompletionBarDef): number | null {
  let total = 0;
  let done = 0;
  for (const t of tasks) {
    if (!bar.matches(t)) continue;
    total += 1;
    if (t.status === "done") done += 1;
  }
  return total > 0 ? Math.round((done / total) * 100) : null;
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
