"use client";

import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";
import { flattenSelectionRows, type SelectionRow } from "@/lib/curriculum/rows";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import { TopicLevelMistakeList } from "@/components/topic-level-mistake-list";
import { hasMistake, toggleMistake } from "@/lib/topic-mistakes";
import { isMaarifTytMergedCourseId } from "@/lib/curriculum/maarif-tyt";

export type TopicMistakeStatus = "wrong" | "blank";
export type TopicMistake = { course_id: string; topic_id: string; status: TopicMistakeStatus };

// Re-groups the course's flat selection rows (one per checkable/selectable
// unit -- see lib/curriculum/lgs-selection.ts) back into per-Ünite blocks
// for this list's own small header lines, using the same unitRowSpan
// bookkeeping a table would use for its sticky Ünite column.
function selectionBlocks(course: Course): { unitLabel: string; rows: SelectionRow[] }[] {
  const blocks: { unitLabel: string; rows: SelectionRow[] }[] = [];
  for (const row of flattenSelectionRows(course)) {
    if (row.unitRowSpan !== null) blocks.push({ unitLabel: row.unitLabel, rows: [row] });
    else blocks[blocks.length - 1].rows.push(row);
  }
  return blocks;
}

// Coach-side mirror of app/student/_components/daily-tasks/topic-mistake-selector.tsx
// (duplicated per this repo's panel-duplication convention, not shared).
// Yanlış and Boş are independent flags (a topic can have both in one exam) --
// see lib/topic-mistakes.ts; unique per task + course + topic + status in the
// DB (migration 0116).
export function TopicMistakeSelector({
  groups,
  selected,
  onChange,
}: {
  groups: { label: string; courses: Course[] }[];
  selected: TopicMistake[];
  onChange: (next: TopicMistake[]) => void;
}) {
  const has = (courseId: string, topicId: string, status: TopicMistakeStatus) => hasMistake(selected, courseId, topicId, status);

  function toggle(courseId: string, topicId: string, status: TopicMistakeStatus) {
    onChange(toggleMistake(selected, courseId, topicId, status));
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
              {/* A merged 9th+10th "Maarif TYT" course (an 11th grader's exam)
                  is ticked per raw topic, so the analysis can count missed topics. */}
              {isMaarifTytMergedCourseId(course.id) ? (
                <TopicLevelMistakeList course={course} has={has} onToggle={toggle} />
              ) : (
                selectionBlocks(course).map((block, blockIndex) => (
                // Index included -- the curriculum data can have multiple
                // units literally named "-" (standalone/ungrouped
                // topics), which would otherwise collide on unit.unit alone.
                <div key={`${block.unitLabel}-${blockIndex}`} className="space-y-1 pl-1">
                  <p className="text-muted-foreground text-xs">{block.unitLabel}</p>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {block.rows.map((row) => {
                      const isWrong = has(course.id, row.id, "wrong");
                      const isBlank = has(course.id, row.id, "blank");
                      return (
                        <div
                          key={row.id}
                          className="hover:bg-accent/40 flex items-start gap-2 rounded-md px-2 py-1 text-sm"
                        >
                          <span className="text-foreground min-w-0 flex-1">
                            <span className="block truncate">{row.label}</span>
                            <ReadOnlySubtopics names={row.readOnlyNames} />
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(course.id, row.id, "wrong")}
                            aria-pressed={isWrong}
                            title="Yanlış"
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                              isWrong ? "bg-rose-500/20 text-rose-600" : "bg-muted text-muted-foreground hover:bg-accent",
                            )}
                          >
                            Y
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(course.id, row.id, "blank")}
                            aria-pressed={isBlank}
                            title="Boş"
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                              isBlank ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground hover:bg-accent",
                            )}
                          >
                            B
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                ))
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
