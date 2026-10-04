"use client";

import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";
import { flattenSelectionRows, type SelectionRow } from "@/lib/curriculum/rows";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import { TopicLevelMistakeList } from "@/components/topic-level-mistake-list";
import { isMaarifTytMergedCourseId } from "@/lib/curriculum/maarif-tyt";
import type { TopicMistake, TopicMistakeStatus } from "./types";

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

// One topic can carry at most one status per trial (mirrors the DB's
// unique(task_id, course_id, topic_id) -- deliberately not two
// independent checkboxes, to keep this a quick tag rather than a second
// question-by-question breakdown).
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
              {/* A merged 9th+10th "Maarif TYT" course (an 11th grader's exam)
                  is ticked per raw topic, so the analysis can count missed topics. */}
              {isMaarifTytMergedCourseId(course.id) ? (
                <TopicLevelMistakeList course={course} statusOf={statusOf} onSet={setStatus} />
              ) : (
                selectionBlocks(course).map((block, blockIndex) => (
                // Index included -- the curriculum data can have multiple
                // units literally named "-" (standalone/ungrouped
                // topics), which previously collided on unit.unit alone.
                <div key={`${block.unitLabel}-${blockIndex}`} className="space-y-1 pl-1">
                  <p className="text-muted-foreground text-xs">{block.unitLabel}</p>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {block.rows.map((row) => {
                      const status = statusOf(course.id, row.id);
                      return (
                        <div
                          key={row.id}
                          className="hover:bg-accent/40 flex items-start gap-2 rounded-md px-2 py-1 text-sm"
                        >
                          <span className="text-foreground min-w-0 flex-1">
                            <span className="block truncate">{row.label}</span>
                            {/* Every subtopic this selectable row rolls up,
                                as plain read-only context -- marking Y/B
                                here applies to the whole group. */}
                            <ReadOnlySubtopics names={row.readOnlyNames} />
                          </span>
                          <button
                            type="button"
                            onClick={() => setStatus(course.id, row.id, "wrong")}
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
                            onClick={() => setStatus(course.id, row.id, "blank")}
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
                ))
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
