import { z } from "zod";

import { MAARIF_GRADES, type MaarifGrade } from "./maarif-grade";
import { AYT_COURSES_BY_TRACK, TYT_COURSES, findCourseById, isLgsCourseId, type Course } from "@/lib/curriculum";
import { isMaarifTytMergedCourseId } from "@/lib/curriculum/maarif-tyt";
import { kaynakTakibiRows } from "@/lib/curriculum/rows";
import type { ExamType } from "@/lib/exam-type";

// The per-topic "learning pipeline" checkboxes on the Kaynak Takibi table.
// Each cohort has its own steps and its own table:
//   LGS (lgs_topic_pipeline_status): Okul İlerlemesi, Konu Tekrarı  ...books...  MEB Kaynağı, Çıkmış Sorular
//   YKS (yks_topic_pipeline_status): Konu Çalışması                 ...books...  Çıkmış Sorular
//   Maarif (same yks_topic_pipeline_status table, via pipelineConfigFor):
//                                     Okul İlerlemesi, Konu Çalışması  ...books...  Çıkmış Sorular
// `start` steps are the columns right after the topic name (before every
// resource column), `end` steps come after the last resource column -- the
// natural order a topic is worked through in. A step's `key` is also its
// column name. ("Soru Çözümü" is the existing resource matrix in between,
// not a pipeline step.)

export type PipelineStepKey =
  | "okul_ilerlemesi"
  | "konu_tekrari"
  | "meb_kaynagi"
  | "cikmis_sorular"
  | "konu_calismasi";

export type PipelineStep = { key: PipelineStepKey; label: string };

export type PipelineConfig = {
  table: "lgs_topic_pipeline_status" | "yks_topic_pipeline_status";
  start: readonly PipelineStep[];
  end: readonly PipelineStep[];
};

export const PIPELINE_CONFIG: Record<ExamType, PipelineConfig> = {
  LGS: {
    table: "lgs_topic_pipeline_status",
    start: [
      { key: "okul_ilerlemesi", label: "Okul İlerlemesi" },
      { key: "konu_tekrari", label: "Konu Tekrarı" },
    ],
    end: [
      { key: "meb_kaynagi", label: "MEB Kaynağı" },
      { key: "cikmis_sorular", label: "Çıkmış Sorular" },
    ],
  },
  YKS: {
    table: "yks_topic_pipeline_status",
    start: [{ key: "konu_calismasi", label: "Konu Çalışması" }],
    end: [{ key: "cikmis_sorular", label: "Çıkmış Sorular" }],
  },
};

// A Maarif student (exam_type='YKS', flagged is_maarif9/10/11) additionally
// tracks "Okul İlerlemesi" -- what was actually covered in their own school
// classes -- on the SAME table ordinary YKS students use (0115), with one
// more column. An ordinary YKS/mezun student's PIPELINE_CONFIG.YKS above is
// untouched. Unlike every other step (collapsed to one checkbox per Kaynak
// Takibi unit row, see lib/curriculum/maarif-selection.ts), Okul İlerlemesi
// renders at raw subtopic granularity -- see MaarifTableBody
// (components/maarif-table-body.tsx), used by course-table.tsx and
// editable-course-table.tsx.
const MAARIF_PIPELINE_CONFIG: PipelineConfig = {
  table: "yks_topic_pipeline_status",
  start: [
    { key: "okul_ilerlemesi", label: "Okul İlerlemesi" },
    { key: "konu_calismasi", label: "Konu Çalışması" },
  ],
  end: [{ key: "cikmis_sorular", label: "Çıkmış Sorular" }],
};

// The 7th grade's own pipeline: the same two topic steps, but NO "Çıkmış Sorular" column (the 7th grade has
// no past-question data -- no national exam -- and none is wanted). Its Kaynak Takibi also lays the steps out
// differently (components/maarif-table-body.tsx): Okul İlerlemesi AND Konu Çalışması are ticked on every
// individual topic line, while the resource ticks (Soru Çözümü / Kaynak Taraması) sit once per unit.
const MAARIF7_PIPELINE_CONFIG: PipelineConfig = {
  table: "yks_topic_pipeline_status",
  start: [
    { key: "okul_ilerlemesi", label: "Okul İlerlemesi" },
    { key: "konu_calismasi", label: "Konu Çalışması" },
  ],
  end: [],
};

// The steps ticked on every individual topic line (not once per group): a group then counts as done
// only when EVERY topic of it is ticked (collapsePipelineMapForRows' `everyMemberSteps`).
export function perTopicStepsFor(maarifGrade: MaarifGrade | null): readonly PipelineStepKey[] {
  return maarifGrade === 7 ? ["okul_ilerlemesi", "konu_calismasi"] : ["okul_ilerlemesi"];
}

// The config a student's Kaynak Takibi pipeline actually renders/validates
// against -- LGS and an ordinary YKS/mezun student get their fixed
// PIPELINE_CONFIG entry unchanged; a Maarif student (any of the three
// grades, including an 11th grader's merged "Maarif TYT" tab) gets
// MAARIF_PIPELINE_CONFIG instead. The one function every server page,
// Server Action and client table/tab goes through, so cohort + Maarif
// grade always resolve to the same config everywhere.
export function pipelineConfigFor(examType: ExamType, maarifGrade: MaarifGrade | null): PipelineConfig {
  if (examType === "LGS") return PIPELINE_CONFIG.LGS;
  if (maarifGrade === 7) return MAARIF7_PIPELINE_CONFIG;
  return maarifGrade !== null ? MAARIF_PIPELINE_CONFIG : PIPELINE_CONFIG.YKS;
}

export function allPipelineSteps(config: PipelineConfig): PipelineStep[] {
  return [...config.start, ...config.end];
}

// A topic with no row (or a step the cohort doesn't have) reads as false.
export type PipelineState = Partial<Record<PipelineStepKey, boolean>>;
// topicId -> its checkboxes.
export type PipelineMap = Record<string, PipelineState>;

export type PipelineRow = { course_id: string; topic_id: string } & PipelineState;

// Everything a Kaynak Takibi table needs to render + drive the pipeline
// columns; passed as one optional prop so "no pipeline" is just `undefined`.
export type PipelineBinding = {
  config: PipelineConfig;
  map: PipelineMap;
  onToggle: (topicId: string, step: PipelineStepKey) => void;
};

// "course_id, topic_id, <step columns>" for the cohort's table.
export function pipelineSelectColumns(config: PipelineConfig): string {
  return ["course_id", "topic_id", ...allPipelineSteps(config).map((s) => s.key)].join(", ");
}

// DB rows -> { courseId -> PipelineMap }, keeping only the cohort's own steps.
export function groupPipelineRows(rows: PipelineRow[], config: PipelineConfig): Record<string, PipelineMap> {
  const steps = allPipelineSteps(config);
  const byCourse: Record<string, PipelineMap> = {};
  for (const r of rows) {
    const state: PipelineState = {};
    for (const step of steps) state[step.key] = Boolean(r[step.key]);
    (byCourse[r.course_id] ??= {})[r.topic_id] = state;
  }
  return byCourse;
}

export type PipelineSummary = {
  totalTopics: number;
  perStep: Partial<Record<PipelineStepKey, number>>;
  // Topics with every step of the cohort's pipeline checked.
  completed: number;
};

// Iterates the course's own Kaynak Takibi rows (lib/curriculum/rows.ts),
// not its raw topic list -- for a plain course this is one row per topic,
// unchanged from before. For a rolled-up LGS or Maarif row it's one entry
// for the whole group, so a Kaynak Takibi table that only renders one
// pipeline row per row (not one per now-hidden subtopic) gets a
// totalTopics/completed count that actually matches what's on screen --
// using the SAME rollup function the table itself renders from, so the two
// can never disagree on what counts as "one row" for any cohort.
export function summarizePipeline(course: Course, map: PipelineMap, config: PipelineConfig): PipelineSummary {
  const rows = kaynakTakibiRows(course);
  const steps = allPipelineSteps(config);
  const perStep: Partial<Record<PipelineStepKey, number>> = {};
  for (const step of steps) perStep[step.key] = 0;
  let completed = 0;
  for (const row of rows) {
    const state = map[row.id];
    if (!state) continue;
    let all = true;
    for (const step of steps) {
      if (state[step.key]) perStep[step.key] = (perStep[step.key] ?? 0) + 1;
      else all = false;
    }
    if (all) completed += 1;
  }
  return { totalTopics: rows.length, perStep, completed };
}

// Folds a raw per-topic PipelineMap onto a table's own selection rows (OR
// across each row's memberTopicIds), so a Kaynak Takibi row that now
// represents a whole rolled-up LGS group (e.g. a Konu standing in for its
// Alt Konu list) shows checked the moment ANY of those now-hidden
// subtopics was checked before this change -- nothing looks reset just
// because the table stopped rendering them as their own rows. A no-op
// (1:1 remap) for a table whose rows are already one real topic each,
// which is every non-LGS course and every ungrouped LGS row.
//
// `everyMemberSteps` lists steps that fold with AND instead of OR: a Maarif
// unit's Okul İlerlemesi is ticked per subtopic, so the unit counts as done
// (for the summary bar) only once EVERY subtopic is ticked.
export function collapsePipelineMapForRows(
  rows: { id: string; memberTopicIds: string[] }[],
  map: PipelineMap,
  config: PipelineConfig,
  everyMemberSteps: readonly PipelineStepKey[] = [],
): PipelineMap {
  const steps = allPipelineSteps(config);
  const collapsed: PipelineMap = {};
  for (const row of rows) {
    const state: PipelineState = {};
    for (const step of steps) {
      state[step.key] = everyMemberSteps.includes(step.key)
        ? row.memberTopicIds.length > 0 && row.memberTopicIds.every((id) => map[id]?.[step.key])
        : row.memberTopicIds.some((id) => map[id]?.[step.key]);
    }
    collapsed[row.id] = state;
  }
  return collapsed;
}

// The courses whose Kaynak Takibi table has a pipeline for each cohort: the
// real TYT/AYT subject courses for YKS, the lgs- courses for LGS.
function yksCourseIds(): Set<string> {
  return new Set([
    ...TYT_COURSES.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ]);
}

// Shape check shared by the student's and the coach's toggle actions. The
// cohort-dependent part (which steps / courses are legal) needs the student's
// exam_type, so it is checked separately by validatePipelineStep.
export const pipelineStepSchema = z.object({
  courseId: z.string().trim().max(60),
  topicId: z.string().trim().max(120),
  step: z.enum(["okul_ilerlemesi", "konu_tekrari", "meb_kaynagi", "cikmis_sorular", "konu_calismasi"]),
  value: z.boolean(),
});

export type PipelineStepInput = z.infer<typeof pipelineStepSchema>;

// What the two toggle actions RETURN instead of throwing: a thrown Error's
// message is replaced by a generic one once it crosses the Server Action
// boundary in a production build (see the note in
// app/student/kaynak-takibi/actions.ts), so the friendly Turkish reason
// ("Bu adım bu öğrenci için geçerli değil.", "Oturum bulunamadı.") would
// never reach the toast. A returned value always does.
export type PipelineActionResult = { ok: true } | { ok: false; error: string };

// Throws (a user-facing Turkish message) unless `input` is a legal toggle for
// a student of this cohort: one of THEIR pipeline's steps, on a course of
// THEIR curriculum, on a topic that belongs to that course. This is what
// keeps an arbitrary column name or a cross-cohort course out of the upsert.
export function validatePipelineStep(examType: ExamType, input: PipelineStepInput, maarifGrade: MaarifGrade | null = null): void {
  const config = pipelineConfigFor(examType, maarifGrade);
  if (!allPipelineSteps(config).some((s) => s.key === input.step)) {
    throw new Error("Bu adım bu öğrenci için geçerli değil.");
  }
  const course = findCourseById(input.courseId);
  // A Maarif student (an exam_type=YKS row with is_maarif9 / is_maarif10 /
  // is_maarif11) tracks only their own grade's courses -- except an 11th
  // grader, who additionally gets the "Maarif TYT" tab's merged 9th+10th
  // grade courses (lib/curriculum/maarif-tyt.ts), never the other grade's
  // SOLO courses directly.
  const courseAllowed =
    examType === "LGS"
      ? isLgsCourseId(input.courseId)
      : yksCourseIds().has(input.courseId) ||
        (maarifGrade !== null && MAARIF_GRADES[maarifGrade].isCourseId(input.courseId)) ||
        (maarifGrade === 11 && isMaarifTytMergedCourseId(input.courseId));
  if (!course || !courseAllowed) throw new Error("Geçersiz ders.");
  if (!course.units.some((u) => u.topics.some((t) => t.id === input.topicId))) {
    throw new Error("Geçersiz konu.");
  }
}
