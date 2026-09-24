import { z } from "zod";

import { isMaarif9CourseId } from "./curriculum/maarif9";
import { AYT_COURSES_BY_TRACK, TYT_COURSES, findCourseById, isLgsCourseId, type Course } from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";

// The per-topic "learning pipeline" checkboxes on the Kaynak Takibi table.
// Each cohort has its own steps and its own table:
//   LGS (lgs_topic_pipeline_status): Okul İlerlemesi, Konu Tekrarı  ...books...  MEB Kaynağı, Çıkmış Sorular
//   YKS (yks_topic_pipeline_status): Konu Çalışması                 ...books...  Çıkmış Sorular
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

export function summarizePipeline(course: Course, map: PipelineMap, config: PipelineConfig): PipelineSummary {
  const topics = course.units.flatMap((u) => u.topics);
  const steps = allPipelineSteps(config);
  const perStep: Partial<Record<PipelineStepKey, number>> = {};
  for (const step of steps) perStep[step.key] = 0;
  let completed = 0;
  for (const topic of topics) {
    const state = map[topic.id];
    if (!state) continue;
    let all = true;
    for (const step of steps) {
      if (state[step.key]) perStep[step.key] = (perStep[step.key] ?? 0) + 1;
      else all = false;
    }
    if (all) completed += 1;
  }
  return { totalTopics: topics.length, perStep, completed };
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
export function validatePipelineStep(examType: ExamType, input: PipelineStepInput, isMaarif9 = false): void {
  const config = PIPELINE_CONFIG[examType];
  if (!allPipelineSteps(config).some((s) => s.key === input.step)) {
    throw new Error("Bu adım bu öğrenci için geçerli değil.");
  }
  const course = findCourseById(input.courseId);
  // A 9th grader (is_maarif9, an exam_type=YKS row) tracks the 9th-grade courses.
  const courseAllowed =
    examType === "LGS"
      ? isLgsCourseId(input.courseId)
      : yksCourseIds().has(input.courseId) || (isMaarif9 && isMaarif9CourseId(input.courseId));
  if (!course || !courseAllowed) throw new Error("Geçersiz ders.");
  if (!course.units.some((u) => u.topics.some((t) => t.id === input.topicId))) {
    throw new Error("Geçersiz konu.");
  }
}
