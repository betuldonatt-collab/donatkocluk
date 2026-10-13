"use client";

import { useMemo, useState } from "react";

import { CourseTabs } from "@/components/course-tabs";
import { TrialBreakdownLine, TrialSourceSwitch } from "@/components/trial-source-switch";
import { formatChartRangeLabel, isDateInChartRange, LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";
import { cn } from "@/lib/utils";
import type { ExamType } from "@/lib/exam-type";
import {
  HEAT_TIER_STYLES,
  computeGelisimHaritasi,
  heatTier,
  type GelisimHaritasiRow,
  type TopicMistakeRow,
  type TrialExam,
  type TrialSource,
} from "@/lib/gelisim-haritasi";
import { ChartRangePicker } from "../../_components/charts/chart-range-picker";

// Spelled out in full sentences rather than the old "1/8 son deneme"
// shorthand. The map covers every exam about the course inside the chosen
// range (Genel Deneme, combined Branş, single Branş -- see
// lib/gelisim-haritasi.ts); with the Genel / Branş switch the sentence names
// the kind that is shown.
const SOURCE_PHRASE: Record<TrialSource, string> = {
  all: "branş/genel denemede",
  general: "genel denemede",
  branch: "branş denemesinde",
};

function formatTopicPerformanceText(row: GelisimHaritasiRow, source: TrialSource): string {
  const { windowSize, wrongCount, blankCount } = row;
  const where = SOURCE_PHRASE[source];

  if (windowSize === 0) {
    return source === "all"
      ? "Bu aralıkta bu konudan branş veya genel deneme kaydın yok."
      : source === "general"
        ? "Bu aralıkta bu konudan genel deneme kaydın yok."
        : "Bu aralıkta bu konudan branş denemesi kaydın yok.";
  }

  const span = `Bu aralıktaki ${windowSize} ${where}`;
  if (wrongCount === 0 && blankCount === 0) {
    return `${span} bu konudan hiç hata yapmamışsın.`;
  }
  if (blankCount === 0) {
    return `${span} bu konudan ${wrongCount} yanlış yapmışsın.`;
  }
  if (wrongCount === 0) {
    return `${span} bu konuyu ${blankCount} kez boş bırakmışsın.`;
  }
  return `${span} bu konudan ${wrongCount} yanlış yapmış, ${blankCount} kez boş bırakmışsın.`;
}

function TopicGrid({ courseId, rows, source }: { courseId: string; rows: GelisimHaritasiRow[]; source: TrialSource }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);

  if (courseRows.length === 0) {
    return <p className="text-muted-foreground text-sm">Bu ders için konu verisi yok.</p>;
  }

  return (
    <div className="space-y-3">
      <TrialBreakdownLine rows={courseRows} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {courseRows.map((row) => {
          const tier = heatTier(row.count, row.windowSize);
          return (
            <div key={row.topicId} className={cn("space-y-1 rounded-lg border px-3 py-2", HEAT_TIER_STYLES[tier].tile)}>
              <p className="text-sm font-medium">{row.topicName}</p>
              <p className="text-xs leading-snug opacity-80">{formatTopicPerformanceText(row, source)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Student-side mirror of the coach's GelisimHaritasiTab
// (app/coach/students/[id]/_components/gelisim-haritasi-tab.tsx) --
// duplicated per this repo's panel-UI convention (the computation itself
// is shared, see lib/gelisim-haritasi.ts). No Card wrapper -- this page's
// own DenemeAnalizleriLayout already provides the section header.
//
// One merged map per subject: the chips are the atomic subjects (Fizik, Kimya, ...); a combined "TYT Fen" exam's marks are
// already folded onto them by the computation, so there are no combined chips here. The map covers EVERY exam inside the date
// range the student picked (no cap on how many; "Son 30 Gün" until they pick a calendar range, like the Branş page), and the
// Tümü / Genel / Branş switch narrows it to one kind of exam.
export function GelisimHaritasi({
  exams,
  mistakes,
  courseIds,
  examType,
}: {
  exams: TrialExam[];
  mistakes: TopicMistakeRow[];
  courseIds: string[];
  examType: ExamType;
}) {
  const [source, setSource] = useState<TrialSource>("all");
  const [range, setRange] = useState<ChartRange>(LAST_30_DAYS_RANGE);

  const examsInRange = useMemo(() => exams.filter((e) => isDateInChartRange(e.task_date, range)), [exams, range]);
  const rows = useMemo(
    () => computeGelisimHaritasi(courseIds, examsInRange, mistakes, { source }),
    [courseIds, examsInRange, mistakes, source],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" data-slot="range-summary">
          {formatChartRangeLabel(range)} içindeki denemelerdeki hata sıklığı.
        </p>
        <ChartRangePicker value={range} onChange={setRange} />
      </div>

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

      <CourseTabs examType={examType} render={(course) => <TopicGrid courseId={course.id} rows={rows} source={source} />} />
    </div>
  );
}
