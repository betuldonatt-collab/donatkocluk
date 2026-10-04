"use client";

import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";
import { topicLinesForUnit } from "@/lib/curriculum/topic-display";

type Status = "wrong" | "blank";

// The mistake picker's list for a merged "Maarif TYT" course (an 11th
// grader's exam, whose analysis is shown per bucket with a COUNT of missed
// topics -- lib/curriculum/maarif-tyt-deneme-mapping.ts). Unlike the usual
// picker, which tags one whole selection group at a time, every raw 9th/10th
// topic gets its own Y / B here, so the count is a real number of topics.
// Headings are written once above their topics, as in the Kaynak Takibi
// table. Shared by the student's and the coach's pickers.
export function TopicLevelMistakeList({
  course,
  statusOf,
  onSet,
}: {
  course: Course;
  statusOf: (courseId: string, topicId: string) => Status | null;
  onSet: (courseId: string, topicId: string, status: Status) => void;
}) {
  return (
    <>
      {course.units.map((unit, unitIndex) => (
        <div key={`${unit.unit}-${unitIndex}`} className="space-y-1 pl-1">
          <p className="text-muted-foreground text-xs">{unit.unit}</p>
          <div className="space-y-0.5">
            {topicLinesForUnit(unit.topics).map((line, i) => {
              if (line.kind === "heading") {
                return (
                  <p
                    key={`h-${i}`}
                    style={{ paddingLeft: `${0.5 + line.depth * 0.75}rem` }}
                    className="text-foreground pt-1 text-xs font-semibold"
                  >
                    {line.text}
                  </p>
                );
              }
              const status = statusOf(course.id, line.topicId);
              return (
                <div
                  key={line.topicId}
                  style={{ paddingLeft: `${0.5 + line.depth * 0.75}rem` }}
                  className="hover:bg-accent/40 flex items-start gap-2 rounded-md py-1 pr-2 text-sm"
                >
                  <span className="text-foreground min-w-0 flex-1">{line.text}</span>
                  <button
                    type="button"
                    onClick={() => onSet(course.id, line.topicId, "wrong")}
                    aria-pressed={status === "wrong"}
                    title="Yanlış"
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      status === "wrong" ? "bg-rose-500/20 text-rose-600" : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    Y
                  </button>
                  <button
                    type="button"
                    onClick={() => onSet(course.id, line.topicId, "blank")}
                    aria-pressed={status === "blank"}
                    title="Boş"
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      status === "blank" ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    B
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
