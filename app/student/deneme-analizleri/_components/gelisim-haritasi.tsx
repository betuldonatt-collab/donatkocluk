"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { HEAT_TIER_STYLES, WINDOW_SIZE, heatTier, type GelisimHaritasiRow } from "@/lib/gelisim-haritasi";

function CourseChips({ courses, selectedId, onSelect }: { courses: Course[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

// Spelled out in full sentences rather than the old "1/8 son deneme"
// shorthand, and explicitly names both branş and genel denemeler in
// every branch -- computeGelisimHaritasi's window mixes both exam types
// together (see lib/gelisim-haritasi.ts), and a bare "son 8 deneme"
// reads to a student as "the last 8 full mock exams", which isn't what
// windowSize actually counts.
function formatTopicPerformanceText(row: GelisimHaritasiRow): string {
  const { windowSize, wrongCount, blankCount } = row;

  if (windowSize === 0) return "Bu konudan henüz branş veya genel deneme kaydın yok.";

  if (wrongCount === 0 && blankCount === 0) {
    return `Son ${windowSize} branş/genel denemede bu konudan hiç hata yapmamışsın.`;
  }
  if (blankCount === 0) {
    return `Son ${windowSize} branş/genel denemede bu konudan ${wrongCount} yanlış yapmışsın.`;
  }
  if (wrongCount === 0) {
    return `Son ${windowSize} branş/genel denemede bu konuyu ${blankCount} kez boş bırakmışsın.`;
  }
  return `Son ${windowSize} branş/genel denemede bu konudan ${wrongCount} yanlış yapmış, ${blankCount} kez boş bırakmışsın.`;
}

function TopicGrid({ courseId, rows }: { courseId: string; rows: GelisimHaritasiRow[] }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);

  if (courseRows.length === 0) {
    return <p className="text-muted-foreground text-sm">Bu ders için konu verisi yok.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {courseRows.map((row) => {
        const tier = heatTier(row.count, row.windowSize);
        return (
          <div key={row.topicId} className={cn("space-y-1 rounded-lg border px-3 py-2", HEAT_TIER_STYLES[tier].tile)}>
            <p className="text-sm font-medium">{row.topicName}</p>
            <p className="text-xs leading-snug opacity-80">{formatTopicPerformanceText(row)}</p>
          </div>
        );
      })}
    </div>
  );
}

// Student-side mirror of the coach's GelisimHaritasiTab
// (app/coach/students/[id]/_components/gelisim-haritasi-tab.tsx) --
// duplicated per this repo's panel-UI convention (the computation itself
// is shared, see lib/gelisim-haritasi.ts). No Card wrapper -- this page's
// own DenemeAnalizleriLayout already provides the section header.
export function GelisimHaritasi({ rows }: { rows: GelisimHaritasiRow[] }) {
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  // Macro ("whole fruit") branch-exam subjects sit alongside the atomic
  // ("sliced") ones here too, so a mistake logged under a combined "TYT
  // Fen" exam shows up in its own chip, independent of "Fizik"/"Kimya"/
  // "Biyoloji"'s own chips.
  const tytCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytCourses = [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[track], ...AYT_COURSES_BY_TRACK[track]];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">Son {WINDOW_SIZE} denemedeki hata sıklığı.</p>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(["hot", "warm", "cool"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
            <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
          </span>
        ))}
      </div>

      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-4 pt-4">
          <CourseChips courses={tytCourses} selectedId={tytCourseId} onSelect={setTytCourseId} />
          <TopicGrid courseId={tytCourseId} rows={rows} />
        </TabsContent>

        <TabsContent value="ayt" className="space-y-4 pt-4">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTrackChange(t)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  track === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <TopicGrid courseId={aytCourseId} rows={rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
