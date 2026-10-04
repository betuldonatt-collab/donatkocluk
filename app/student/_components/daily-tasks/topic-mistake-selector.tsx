"use client";

import { Fragment } from "react";

import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";
import { flattenSelectionRows, type SelectionRow } from "@/lib/curriculum/rows";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import { TopicLevelMistakeList } from "@/components/topic-level-mistake-list";
import { hasMistake, hasMistakeInGroup, toggleMistake, toggleMistakeInGroup } from "@/lib/topic-mistakes";
import { isMaarifTytMergedCourseId } from "@/lib/curriculum/maarif-tyt";
import { hasBucketedStructure } from "@/lib/curriculum/maarif-tyt-structure";
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

// Yanlış and Boş are independent flags: a topic can have several questions in
// one exam, one answered wrong and another left blank, so both can be set on
// the same topic at once (lib/topic-mistakes.ts; unique per task + course +
// topic + status in the DB, migration 0116).
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

  // A row may roll up several hidden topics (a bucket): see lib/topic-mistakes.ts.
  const hasRow = (courseId: string, row: SelectionRow, status: TopicMistakeStatus) =>
    hasMistakeInGroup(selected, courseId, row.memberTopicIds, status);
  function toggleRow(courseId: string, row: SelectionRow, status: TopicMistakeStatus) {
    onChange(toggleMistakeInGroup(selected, courseId, row.memberTopicIds, status));
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
              {/* A merged 9th+10th "Maarif TYT" course WITHOUT a bucket structure yet
                  (an 11th grader's exam) is ticked per raw topic. One WITH a
                  structure (Coğrafya, Tarih) lists only its buckets, below. */}
              {isMaarifTytMergedCourseId(course.id) && !hasBucketedStructure(course.id) ? (
                <TopicLevelMistakeList course={course} has={has} onToggle={toggle} />
              ) : (
                selectionBlocks(course).map((block, blockIndex) => (
                // Index included -- the curriculum data can have multiple
                // units literally named "-" (standalone/ungrouped
                // topics), which previously collided on unit.unit alone.
                <div key={`${block.unitLabel}-${blockIndex}`} className="space-y-1 pl-1">
                  <p className="text-muted-foreground text-xs">{block.unitLabel}</p>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {block.rows.map((row, rowIndex) => {
                      const isWrong = hasRow(course.id, row, "wrong");
                      const isBlank = hasRow(course.id, row, "blank");
                      // An intermediate group heading (Kimya: "Kimya Hayattır") once above its buckets.
                      const showGroup = row.groupLabel !== undefined && row.groupLabel !== block.rows[rowIndex - 1]?.groupLabel;
                      return (
                        <Fragment key={row.id}>
                        {showGroup && <p className="text-foreground col-span-full pt-1 text-xs font-semibold">{row.groupLabel}</p>}
                        <div
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
                            onClick={() => toggleRow(course.id, row, "wrong")}
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
                            onClick={() => toggleRow(course.id, row, "blank")}
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
                        </Fragment>
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
