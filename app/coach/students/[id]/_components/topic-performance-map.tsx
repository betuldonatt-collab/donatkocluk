"use client";

import { CourseTabs } from "@/components/course-tabs";
import { cn } from "@/lib/utils";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  type Track,
} from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import type { WeakTopicRow } from "../weak-topic-map";

export type TopicPerformanceRow = WeakTopicRow & {
  sampleSize: number;
  // Question-level practice totals for this topic (task-based +
  // book-based combined) -- a different signal than count/sampleSize
  // above, which is exam-mistake frequency.
  questionTotal: number;
  questionCorrect: number;
  questionIncorrect: number;
};

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
  );
}

// Filter-driven drill-down -- Main Toggle (TYT/AYT, or SÖZEL/SAYISAL chips
// for LGS) then Course Chips, mirroring the Kaynak Takibi tab's exact
// pattern so the coach only ever looks at one course's full topic list at a
// time.
export function TopicPerformanceMap({ rows, examType = "YKS" }: { rows: TopicPerformanceRow[]; examType?: ExamType }) {
  // Macro ("whole fruit") branch-exam subjects sit alongside the atomic
  // ("sliced") ones here too, so a mistake logged under a combined "TYT
  // Fen" exam shows up in its own chip, independent of "Fizik"/"Kimya"/
  // "Biyoloji"'s own chips.
  const tytCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytCoursesFor = (t: Track) => [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[t], ...AYT_COURSES_BY_TRACK[t]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(["weak", "average", "strong"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", TIER_STYLES[t].dot)} />
            <span className="text-muted-foreground">{TIER_STYLES[t].label}</span>
          </span>
        ))}
      </div>

      <CourseTabs
        examType={examType}
        tytCourses={tytCourses}
        aytCoursesFor={aytCoursesFor}
        render={(course) => <TopicList courseId={course.id} rows={rows} />}
      />
    </div>
  );
}
