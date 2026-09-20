"use client";

import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";

export type TopicMistakeStatus = "wrong" | "blank";
export type TopicMistake = { course_id: string; topic_id: string; status: TopicMistakeStatus };

// Coach-side mirror of app/student/_components/daily-tasks/topic-mistake-selector.tsx
// (duplicated per this repo's panel-duplication convention, not shared).
// One topic carries at most one status per trial -- mirrors the DB's
// unique(task_id, course_id, topic_id).
export function TopicMistakeSelector({
  groups,
  selected,
  onChange,
}: {
  groups: { label: string; courses: Course[] }[];
  selected: TopicMistake[];
  onChange: (next: TopicMistake[]) => void;
}) {
  const statusOf = (courseId: string, topicId: string): TopicMistakeStatus | null =>
    selected.find((m) => m.course_id === courseId && m.topic_id === topicId)?.status ?? null;

  function setStatus(courseId: string, topicId: string, status: TopicMistakeStatus) {
    const others = selected.filter((m) => !(m.course_id === courseId && m.topic_id === topicId));
    if (statusOf(courseId, topicId) === status) {
      onChange(others);
    } else {
      onChange([...others, { course_id: courseId, topic_id: topicId, status }]);
    }
  }

  return (
    <div className="max-h-80 space-y-5 overflow-y-auto pr-1">
      {groups.map((group) => (
        <div key={group.label} className="space-y-3">
          {groups.length > 1 && (
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">{group.label}</p>
          )}
          {group.courses.map((course) => (
            <div key={course.id} className="space-y-2">
              {group.courses.length > 1 && (
                <p className="text-foreground text-sm font-medium">{course.name}</p>
              )}
              {course.units.map((unit, unitIndex) => (
                // Index included -- the curriculum data can have multiple
                // units literally named "-" (standalone/ungrouped
                // topics), which would otherwise collide on unit.unit alone.
                <div key={`${unit.unit}-${unitIndex}`} className="space-y-1 pl-1">
                  <p className="text-muted-foreground text-xs">{unit.konu ? `${unit.unit} › ${unit.konu}` : unit.unit}</p>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {unit.topics.map((topic) => {
                      const status = statusOf(course.id, topic.id);
                      return (
                        <div
                          key={topic.id}
                          className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                        >
                          <span className="text-foreground min-w-0 flex-1 truncate">{topic.name}</span>
                          <button
                            type="button"
                            onClick={() => setStatus(course.id, topic.id, "wrong")}
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
                            onClick={() => setStatus(course.id, topic.id, "blank")}
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
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
