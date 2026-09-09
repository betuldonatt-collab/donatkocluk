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

function CourseChips({
  courses,
  selectedId,
  onSelect,
}: {
  courses: Course[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
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

// Filter-driven drill-down -- Main Toggle (TYT/AYT) then Course Chips,
// mirroring the Kaynak Takibi tab's exact pattern so the coach only ever
// looks at one course's full topic list at a time.
export function TopicPerformanceMap({ rows }: { rows: TopicPerformanceRow[] }) {
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
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(["weak", "average", "strong"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", TIER_STYLES[t].dot)} />
            <span className="text-muted-foreground">{TIER_STYLES[t].label}</span>
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
          <TopicList courseId={tytCourseId} rows={rows} />
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
                  track === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <TopicList courseId={aytCourseId} rows={rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
