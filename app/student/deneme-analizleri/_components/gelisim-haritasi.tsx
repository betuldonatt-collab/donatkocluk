"use client";

import { useState } from "react";

import { CourseTabs } from "@/components/course-tabs";
import { TrialBreakdownLine, TrialSourceSwitch } from "@/components/trial-source-switch";
import { cn } from "@/lib/utils";
import type { ExamType } from "@/lib/exam-type";
import { HEAT_TIER_STYLES, WINDOW_SIZE, heatTier, type GelisimHaritasiRow, type TrialSource } from "@/lib/gelisim-haritasi";

// Spelled out in full sentences rather than the old "1/8 son deneme"
// shorthand. The window mixes every kind of exam about the course (Genel
// Deneme, combined Branş, single Branş -- see lib/gelisim-haritasi.ts), and a
// bare "son 8 deneme" reads to a student as "the last 8 full mock exams", which
// isn't what windowSize actually counts; with the Genel / Branş switch the
// sentence names the kind that is shown.
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
      ? "Bu konudan henüz branş veya genel deneme kaydın yok."
      : source === "general"
        ? "Bu konudan henüz genel deneme kaydın yok."
        : "Bu konudan henüz branş denemesi kaydın yok.";
  }

  if (wrongCount === 0 && blankCount === 0) {
    return `Son ${windowSize} ${where} bu konudan hiç hata yapmamışsın.`;
  }
  if (blankCount === 0) {
    return `Son ${windowSize} ${where} bu konudan ${wrongCount} yanlış yapmışsın.`;
  }
  if (wrongCount === 0) {
    return `Son ${windowSize} ${where} bu konuyu ${blankCount} kez boş bırakmışsın.`;
  }
  return `Son ${windowSize} ${where} bu konudan ${wrongCount} yanlış yapmış, ${blankCount} kez boş bırakmışsın.`;
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
// already folded onto them by the computation, so there are no combined chips here. The server hands over the three source
// variants (Tümü / Genel / Branş) and this only picks one.
export function GelisimHaritasi({
  rowsBySource,
  examType,
}: {
  rowsBySource: Record<TrialSource, GelisimHaritasiRow[]>;
  examType: ExamType;
}) {
  const [source, setSource] = useState<TrialSource>("all");
  const rows = rowsBySource[source];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Son {WINDOW_SIZE} denemedeki hata sıklığı.</p>
        <TrialSourceSwitch value={source} onChange={setSource} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(["hot", "warm", "cool"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
            <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
          </span>
        ))}
      </div>

      <CourseTabs examType={examType} render={(course) => <TopicGrid courseId={course.id} rows={rows} source={source} />} />
    </div>
  );
}
