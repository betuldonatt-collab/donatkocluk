"use client";

import { Fragment } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { splitUnitGradeTag } from "@/lib/curriculum/maarif-tyt";
import { isFlatRows, withGroupHeadings, type SelectionRow } from "@/lib/curriculum/rows";
import { topicLinesForUnit, type TopicLine } from "@/lib/curriculum/topic-display";
import type { PipelineBinding, PipelineMap, PipelineStep } from "@/lib/topic-pipeline";
import { cn } from "@/lib/utils";

// Maarif (9th/10th/11th grade) Kaynak Takibi body, laid out like a
// spreadsheet with merged cells. The unit's title is written once as a
// rowSpan cell on the left. Under it the unit falls into GROUPS -- one per
// heading ("Kimyasal Tepkimeler", "Gazlar"), each shown as a muted heading
// row with its topics on a line of their own beneath it (a unit with no
// headings is a single group). Every group is its own tracked section:
// Soru Dağılımı, Konu Çalışması, Çıkmış Sorular and each resource's Soru
// Çözümü / Kaynak Taraması are rowSpan cells spanning just that group, never
// across the next heading. Only "Okul İlerlemesi" is ticked per topic.
// Each `row` here is one group (lib/curriculum/maarif-selection.ts).
// Shared by the student's and the coach's tables so both read identically;
// the header row stays in each table (it's the same columns).

// The Ünite column's fixed width, shared with the tables' own sticky header
// cells so the sticky Konu column's `left` offset always matches it.
export const MAARIF_UNIT_COL_CLASS = "w-36 min-w-36 max-w-36";
export const MAARIF_KONU_STICKY_LEFT_CLASS = "left-36";
export const MAARIF_STAT_HEAD_CLASSES = { total: "w-11 min-w-11 px-0.5 text-[11px]", count: "w-7 min-w-7 px-0.5 text-[11px]" };

type Stat = { total: number; correct: number; wrong: number; empty: number };

// Deliberately tiny -- the least horizontal space of any column. In the body
// it is one rowSpan block per group (question stats are tracked per group);
// the Karma row passes no rowSpan.
export function MaarifStatCells({ stat, rowSpan }: { stat: Stat | undefined; rowSpan?: number }) {
  const hasData = !!stat && stat.total > 0;
  const cell = "px-0.5 py-1 text-center text-[11px] tabular-nums";
  return (
    <>
      <TableCell rowSpan={rowSpan} className={cn(cell, "font-medium", MAARIF_STAT_HEAD_CLASSES.total)}>{hasData ? stat.total : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn(cell, "text-emerald-700", MAARIF_STAT_HEAD_CLASSES.count)}>{hasData ? stat.correct : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn(cell, "text-rose-700", MAARIF_STAT_HEAD_CLASSES.count)}>{hasData ? stat.wrong : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn(cell, "text-amber-700", MAARIF_STAT_HEAD_CLASSES.count)}>{hasData ? stat.empty : "–"}</TableCell>
    </>
  );
}

// A group's stat = the sum over every real subtopic id it rolls up.
function sumStats(byTopic: Record<string, Stat>, topicIds: string[]): Stat {
  return topicIds.reduce(
    (acc, id) => {
      const s = byTopic[id];
      return s ? { total: acc.total + s.total, correct: acc.correct + s.correct, wrong: acc.wrong + s.wrong, empty: acc.empty + s.empty } : acc;
    },
    { total: 0, correct: 0, wrong: 0, empty: 0 },
  );
}

// The merged "Maarif TYT" tab tags each unit with its grade ("(10. Sınıf) 1.
// Ünite: Sözün Ezgisi"): the grade sits on its own line above the unit's
// name. Every other course's label has no tag and renders as plain text.
function UnitLabel({ label }: { label: string }) {
  const { grade, title } = splitUnitGradeTag(label);
  if (!grade) return <>{title}</>;
  return (
    <>
      <span className="text-muted-foreground mb-0.5 block text-xs font-semibold">{grade}</span>
      {title}
    </>
  );
}

const isBucket = (row: SelectionRow) => row.readOnlyNames.length === 0 && row.memberTopicIds.length > 1;

type PreparedGroup = { row: SelectionRow; lines: TopicLine[]; fullNames: Map<string, string> };

export function MaarifTableBody({
  courseName,
  rows,
  resources,
  progress,
  topicStats,
  pipeline,
  collapsedMap,
  onToggleProgress,
}: {
  courseName: string;
  rows: SelectionRow[];
  resources: { id: string; name: string }[];
  progress: Record<string, { solved: boolean; reviewed: boolean }>;
  topicStats: Record<string, Stat>;
  // `pipeline.map` is the RAW per-topic map (Okul İlerlemesi reads it by each
  // subtopic's own id); `collapsedMap` is the same data folded onto each
  // group's representative id (row.id) for the group-level steps.
  pipeline: PipelineBinding;
  collapsedMap: PipelineMap;
  onToggleProgress: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
}) {
  // Every group as display lines: its heading once (if it has one), then its
  // topics on clean lines beneath (lib/curriculum/topic-display.ts).
  const groups: PreparedGroup[] = rows.map((row) => {
    // A bucket (readOnlyNames empty, several hidden members) is ONE leaf line,
    // named by the bucket: its member topics are never listed.
    if (row.readOnlyNames.length === 0 && row.memberTopicIds.length > 1) {
      return { row, lines: [{ kind: "topic", topicId: row.id, text: row.label, depth: 0 }], fullNames: new Map([[row.id, row.label]]) };
    }
    const fullNames = new Map(row.memberTopicIds.map((id, i) => [id, row.readOnlyNames[i] ?? row.label]));
    const lines = topicLinesForUnit(row.memberTopicIds.map((id) => ({ id, name: fullNames.get(id)! })));
    return { row, lines, fullNames };
  });

  // One Okul İlerlemesi cell per line of the group. A heading line has no
  // topic of its own, so its cell is left blank. Every other step is ONE
  // merged cell on the group's first line, spanning the whole group.
  function stepCell(step: PipelineStep, stepIndex: number, group: PreparedGroup, line: TopicLine, isFirstLine: boolean) {
    const { row, lines, fullNames } = group;
    const scope = row.label === row.unitLabel ? row.label : `${row.unitLabel} - ${row.label}`;
    const border = stepIndex === 0 && "border-l";
    if (step.key === "okul_ilerlemesi" && isBucket(row)) {
      // One tick for the whole bucket: it sets (or clears) every hidden member,
      // and reads as done only when all of them are.
      const checked = collapsedMap[row.id]?.okul_ilerlemesi ?? false;
      return (
        <TableCell key={step.key} className={cn("px-3 py-1 text-center", border)}>
          <Checkbox
            checked={checked}
            onCheckedChange={() => {
              for (const id of row.memberTopicIds) {
                if (!!pipeline.map[id]?.okul_ilerlemesi === checked) pipeline.onToggle(id, "okul_ilerlemesi");
              }
            }}
            aria-label={`${courseName} - ${scope} - ${step.label}`}
          />
        </TableCell>
      );
    }
    if (step.key === "okul_ilerlemesi") {
      if (line.kind === "heading") return <TableCell key={step.key} className={cn("bg-muted/40 px-3 py-1", border)} />;
      return (
        <TableCell key={step.key} className={cn("px-3 py-1 text-center", border)}>
          <Checkbox
            checked={pipeline.map[line.topicId]?.okul_ilerlemesi ?? false}
            onCheckedChange={() => pipeline.onToggle(line.topicId, "okul_ilerlemesi")}
            aria-label={`${courseName} - ${scope} - ${fullNames.get(line.topicId)} - ${step.label}`}
          />
        </TableCell>
      );
    }
    if (!isFirstLine) return null;
    return (
      <TableCell key={step.key} rowSpan={lines.length} className={cn("text-center", border)}>
        <Checkbox
          checked={collapsedMap[row.id]?.[step.key] ?? false}
          onCheckedChange={() => pipeline.onToggle(row.id, step.key)}
          aria-label={`${courseName} - ${scope} - ${step.label}`}
        />
      </TableCell>
    );
  }

  // Rows with their intermediate group headings (Kimya: "Kimya Hayattır") spliced
  // in as heading rows; units without groups pass through unchanged.
  const items = withGroupHeadings(rows);
  // A flat course (Türkçe) has no Ünite column: the Konu column starts at the left edge.
  const flat = isFlatRows(rows);
  const konuLeft = flat ? "left-0" : MAARIF_KONU_STICKY_LEFT_CLASS;
  const preparedById = new Map(groups.map((g) => [g.row.id, g]));
  const linesOf = (item: (typeof items)[number]) => (item.kind === "heading" ? 1 : preparedById.get(item.row.id)!.lines.length);
  // Columns a heading row has to fill after its own text: every pipeline step and
  // resource column that follows the Konu column.
  const fillerCols = pipeline.config.start.length + resources.length * 2 + pipeline.config.end.length;

  return (
    <>
      {items.map((item, ii) => {
        // The unit title spans every line of every row (and heading) in its unit:
        // the first item of a unit carries it.
        const unitLines = item.unitRowSpan === null ? 0 : items.slice(ii, ii + item.unitRowSpan).reduce((n, it) => n + linesOf(it), 0);
        if (item.kind === "heading") {
          return (
            <TableRow key={item.key} className="border-border/40">
              <TableCell colSpan={4} className="bg-muted/40 p-0" />
              {!flat && item.unitRowSpan !== null && (
                <TableCell
                  rowSpan={unitLines}
                  className={cn("bg-card sticky left-0 z-10 border-r border-l px-3 py-2 text-sm font-medium whitespace-normal", MAARIF_UNIT_COL_CLASS)}
                >
                  <UnitLabel label={item.unitLabel} />
                </TableCell>
              )}
              <TableCell
                className={cn("bg-muted text-foreground sticky z-10 min-w-56 border-r px-3 py-1.5 text-xs font-semibold whitespace-normal", konuLeft)}
              >
                {item.label}
              </TableCell>
              {fillerCols > 0 && <TableCell colSpan={fillerCols} className="bg-muted/40 p-0" />}
            </TableRow>
          );
        }
        const group = preparedById.get(item.row.id)!;
        const { row, lines } = group;
        const count = lines.length;
        const scope = row.label === row.unitLabel ? row.label : `${row.unitLabel} - ${row.label}`;
        return lines.map((line, li) => {
          const isFirstLine = li === 0;
          const isLastLine = li === count - 1;
          const isHeading = line.kind === "heading";
          return (
            <TableRow
              key={line.kind === "topic" ? line.topicId : `${row.id}-heading-${li}`}
              className={cn(!isLastLine && "border-border/40")}
            >
              {isFirstLine && <MaarifStatCells stat={sumStats(topicStats, row.memberTopicIds)} rowSpan={count} />}
              {isFirstLine && !flat && item.unitRowSpan !== null && (
                <TableCell
                  rowSpan={unitLines}
                  className={cn(
                    "bg-card sticky left-0 z-10 border-r border-l px-3 py-2 text-sm font-medium whitespace-normal",
                    MAARIF_UNIT_COL_CLASS,
                  )}
                >
                  <UnitLabel label={row.unitLabel} />
                </TableCell>
              )}
              <TableCell
                style={{ paddingLeft: `${0.75 + line.depth * 0.9}rem` }}
                className={cn(
                  "sticky z-10 min-w-56 border-r py-1.5 pr-3 text-sm whitespace-normal",
                  konuLeft,
                  isHeading ? "bg-muted text-foreground text-xs font-semibold" : "bg-card",
                )}
              >
                {line.text}
              </TableCell>
              {pipeline.config.start.map((step, si) => stepCell(step, si, group, line, isFirstLine))}
              {isFirstLine &&
                resources.map((resource) => {
                  const solved = row.memberTopicIds.some((id) => progress[`${id}::${resource.id}`]?.solved);
                  const reviewed = row.memberTopicIds.some((id) => progress[`${id}::${resource.id}`]?.reviewed);
                  return (
                    <Fragment key={resource.id}>
                      <TableCell rowSpan={count} className="border-l text-center">
                        <Checkbox
                          checked={solved}
                          onCheckedChange={() => onToggleProgress(row.id, resource.id, "solved")}
                          aria-label={`${courseName} - ${scope} - ${resource.name} - Soru Çözümü`}
                        />
                      </TableCell>
                      <TableCell rowSpan={count} className="text-center">
                        <Checkbox
                          checked={reviewed}
                          onCheckedChange={() => onToggleProgress(row.id, resource.id, "reviewed")}
                          aria-label={`${courseName} - ${scope} - ${resource.name} - Kaynak Taraması Yapıldı`}
                        />
                      </TableCell>
                    </Fragment>
                  );
                })}
              {pipeline.config.end.map((step, si) => stepCell(step, si, group, line, isFirstLine))}
            </TableRow>
          );
        });
      })}
    </>
  );
}
