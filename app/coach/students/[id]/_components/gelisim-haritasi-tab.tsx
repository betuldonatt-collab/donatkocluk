"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { HEAT_TIER_STYLES, WINDOW_SIZE, heatTier, type GelisimHaritasiRow } from "@/lib/gelisim-haritasi";

function TopicGrid({ courseId, rows }: { courseId: string; rows: GelisimHaritasiRow[] }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);

  if (courseRows.length === 0) {
    return <p className="text-muted-foreground text-sm">Bu ders için konu verisi yok.</p>;
  }

  return (
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
  );
}

// Windowed sibling of Konu Performans Haritası (analytics-tab.tsx) -- last
// WINDOW_SIZE trials per course, rendered as a color tile grid instead of
// a drill-down list. Same TYT/AYT -> course-chips navigation shell,
// duplicated per this repo's panel-UI convention (the computation itself
// is shared, see lib/gelisim-haritasi.ts).
export function GelisimHaritasiTab({ rows, examType = "YKS" }: { rows: GelisimHaritasiRow[]; examType?: ExamType }) {
  // Macro ("whole fruit") branch-exam subjects sit alongside the atomic
  // ("sliced") ones here too, so a mistake logged under a combined "TYT
  // Fen" exam shows up in its own chip, independent of "Fizik"/"Kimya"/
  // "Biyoloji"'s own chips.
  const tytCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytCoursesFor = (t: Track) => [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[t], ...AYT_COURSES_BY_TRACK[t]];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gelişim Haritası</CardTitle>
        <p className="text-muted-foreground text-sm">Son {WINDOW_SIZE} denemedeki hata sıklığı.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {(["hot", "warm", "cool"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
              <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
            </span>
          ))}
        </div>

        <CourseTabs
          examType={examType}
          tytCourses={tytCourses}
          aytCoursesFor={aytCoursesFor}
          render={(course) => <TopicGrid courseId={course.id} rows={rows} />}
        />
      </CardContent>
    </Card>
  );
}
