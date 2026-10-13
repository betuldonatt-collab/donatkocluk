"use client";

import { useMemo, useState } from "react";

import { CourseTabs } from "@/components/course-tabs";
import { TrialBreakdownLine, TrialSourceSwitch } from "@/components/trial-source-switch";
import { cn } from "@/lib/utils";
import type { ExamType } from "@/lib/exam-type";
import { computeGelisimHaritasi, type GelisimHaritasiRow, type TrialSource } from "@/lib/gelisim-haritasi";
import type { DetailTask } from "../types";
import type { WeakTopicRow } from "../weak-topic-map";

export type TopicPerformanceRow = WeakTopicRow & {
  sampleSize: number;
  // What the sample is made of ("3 Genel Deneme, 2 TYT Fizik Branş"), same for every row of a course.
  breakdown: GelisimHaritasiRow["breakdown"];
  // Question-level practice totals for this topic (task-based +
  // book-based combined) -- a different signal than count/sampleSize
  // above, which is exam-mistake frequency.
  questionTotal: number;
  questionCorrect: number;
  questionIncorrect: number;
};

// Lifetime question totals per `${courseId}::${topicId}` (computed on the server from tasks, karma breakdowns and book progress).
export type TopicQuestionTotals = Record<string, { total: number; correct: number; incorrect: number }>;

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

// Three-tier read: 0 mistakes is real good news (Güçlü), not just "no
// data" -- a mid band for the occasional slip, red only once a topic is
// genuinely recurring trouble.
function tier(count: number, sampleSize: number): "strong" | "average" | "weak" {
  if (count === 0) return "strong";
  if (sampleSize <= 0) return "average";
  const ratio = count / sampleSize;
  if (ratio < 0.4) return "average";
  return "weak";
}

const TIER_STYLES: Record<"strong" | "average" | "weak", { dot: string; badge: string; label: string }> = {
  strong: { dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600", label: "Güçlü" },
  average: { dot: "bg-amber-500", badge: "bg-amber-500/15 text-amber-600", label: "Orta" },
  weak: { dot: "bg-rose-500", badge: "bg-rose-500/15 text-rose-600", label: "Zayıf" },
};

function TopicList({ courseId, rows }: { courseId: string; rows: TopicPerformanceRow[] }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);

  if (courseRows.length === 0) {
    return <p className="text-muted-foreground text-sm">Bu ders için konu verisi yok.</p>;
  }

  return (
    <div className="space-y-2">
      <TrialBreakdownLine rows={courseRows.map((r) => ({ windowSize: r.sampleSize, breakdown: r.breakdown }))} lead="Tüm zamanlarda" />
      <div className="border-border space-y-1 rounded-md border px-3 py-2">
        {courseRows.map((row) => {
          const t = tier(row.count, row.sampleSize);
          return (
            <div key={row.topicId} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", TIER_STYLES[t].dot)} />
                <span className="text-foreground truncate">{row.topicName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground tabular-nums">
                  {row.questionTotal > 0 ? `${row.questionCorrect}/${row.questionTotal} doğru` : "—"}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    TIER_STYLES[t].badge,
                  )}
                >
                  {row.count}/{row.sampleSize}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Filter-driven drill-down -- Main Toggle (TYT/AYT, or SÖZEL/SAYISAL chips
// for LGS) then Course Chips, mirroring the Kaynak Takibi tab's exact
// pattern so the coach only ever looks at one course's full topic list at a
// time.
//
// One chip per atomic subject: a mistake logged under a combined "TYT Fen" exam is folded onto Fizik / Kimya / Biyoloji by the
// computation (lib/gelisim-haritasi.ts), together with that subject's Genel Deneme and single Branş exams -- so there are no
// combined chips and every number here is the subject's whole history in one place. The rows are the SAME computation as the
// Gelişim Haritası over the entire history (this map ignores the date filter); the Tümü / Genel / Branş switch narrows it to
// one kind of exam. A student's own unapproved exam stays out, like in every other analytics rollup.
export function TopicPerformanceMap({
  branchExams,
  generalExams,
  examMistakes,
  curriculumCourseIds,
  questionTotals,
  examType = "YKS",
}: {
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  curriculumCourseIds: string[];
  questionTotals: TopicQuestionTotals;
  examType?: ExamType;
}) {
  const [source, setSource] = useState<TrialSource>("all");

  const rows: TopicPerformanceRow[] = useMemo(() => {
    const exams = [...generalExams, ...branchExams].filter((e) => e.is_coach_assigned || e.is_approved_by_coach);
    return computeGelisimHaritasi(curriculumCourseIds, exams, examMistakes, { source }).map((r) => {
      const q = questionTotals[`${r.courseId}::${r.topicId}`];
      return {
        courseId: r.courseId,
        courseName: r.courseName,
        topicId: r.topicId,
        topicName: r.topicName,
        count: r.count,
        examTitles: r.examTitles,
        sampleSize: r.windowSize,
        breakdown: r.breakdown,
        questionTotal: q?.total ?? 0,
        questionCorrect: q?.correct ?? 0,
        questionIncorrect: q?.incorrect ?? 0,
      };
    });
  }, [generalExams, branchExams, examMistakes, curriculumCourseIds, questionTotals, source]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {(["weak", "average", "strong"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", TIER_STYLES[t].dot)} />
              <span className="text-muted-foreground">{TIER_STYLES[t].label}</span>
            </span>
          ))}
        </div>
        <TrialSourceSwitch value={source} onChange={setSource} />
      </div>

      <CourseTabs examType={examType} render={(course) => <TopicList courseId={course.id} rows={rows} />} />
    </div>
  );
}
