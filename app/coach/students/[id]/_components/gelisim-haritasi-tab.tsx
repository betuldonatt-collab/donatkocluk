"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseTabs } from "@/components/course-tabs";
import { TrialBreakdownLine, TrialSourceSwitch } from "@/components/trial-source-switch";
import { formatChartRangeLabel, isDateInChartRange, type ChartRange } from "@/lib/chart-range";
import { cn } from "@/lib/utils";
import type { ExamType } from "@/lib/exam-type";
import {
  computeGelisimHaritasi,
  HEAT_TIER_STYLES,
  WINDOW_SIZE,
  heatTier,
  type GelisimHaritasiRow,
  type TrialSource,
} from "@/lib/gelisim-haritasi";
import type { DetailTask } from "../types";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

function TopicGrid({ courseId, rows }: { courseId: string; rows: GelisimHaritasiRow[] }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);

  if (courseRows.length === 0) {
    return <p className="text-muted-foreground text-sm">Bu ders için konu verisi yok.</p>;
  }

  return (
    <div className="space-y-3">
      <TrialBreakdownLine rows={courseRows} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {courseRows.map((row) => {
          const tier = heatTier(row.count, row.windowSize);
          return (
            <div key={row.topicId} className={cn("space-y-1 rounded-lg border px-3 py-2", HEAT_TIER_STYLES[tier].tile)}>
              <p className="truncate text-sm font-medium">{row.topicName}</p>
              <p className="text-xs tabular-nums opacity-80">
                {row.count}/{row.windowSize} son deneme
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Windowed sibling of Konu Performans Haritası (analytics-tab.tsx) -- last
// WINDOW_SIZE trials per course, rendered as a color tile grid instead of
// a drill-down list. Same TYT/AYT -> course-chips navigation shell,
// duplicated per this repo's panel-UI convention (the computation itself
// is shared, see lib/gelisim-haritasi.ts).
//
// One merged map per subject (Fizik, Kimya, ...): its trials are the Genel Denemeler of the track, the combined Branş
// exams it is part of ("TYT Fen") and its own single Branş exams -- which is why there are no combined chips here. The
// Tümü / Genel / Branş switch narrows the same map to one kind of exam; Tümü is the default overview.
//
// Recomputed here client-side (not passed pre-aggregated from the
// server) so it can react live to the shared date filter (DetailTabs):
// branchExams/generalExams/examMistakes are this student's full,
// unfiltered history already, filtered to `chartRange` first and then
// windowed to each course's last WINDOW_SIZE trials WITHIN that range --
// the two windows compose naturally (fewer than WINDOW_SIZE trials in a
// short range just means a smaller denominator, shown via each row's own
// windowSize).
export function GelisimHaritasiTab({
  branchExams,
  generalExams,
  examMistakes,
  curriculumCourseIds,
  chartRange,
  examType = "YKS",
}: {
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  curriculumCourseIds: string[];
  chartRange: ChartRange;
  examType?: ExamType;
}) {
  const [source, setSource] = useState<TrialSource>("all");

  const rows: GelisimHaritasiRow[] = useMemo(() => {
    const examsInRange = [...generalExams, ...branchExams].filter((e) => isDateInChartRange(e.task_date, chartRange));
    return computeGelisimHaritasi(curriculumCourseIds, examsInRange, examMistakes, { source });
  }, [generalExams, branchExams, examMistakes, curriculumCourseIds, chartRange, source]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gelişim Haritası</CardTitle>
        <p className="text-muted-foreground text-sm">
          {formatChartRangeLabel(chartRange)} içindeki son {WINDOW_SIZE} denemedeki hata sıklığı.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {(["hot", "warm", "cool"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
                <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
              </span>
            ))}
          </div>
          <TrialSourceSwitch value={source} onChange={setSource} />
        </div>

        <CourseTabs examType={examType} render={(course) => <TopicGrid courseId={course.id} rows={rows} />} />
      </CardContent>
    </Card>
  );
}
