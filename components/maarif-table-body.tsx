"use client";

import { Fragment } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { splitUnitGradeTag } from "@/lib/curriculum/maarif-tyt";
import type { SelectionRow } from "@/lib/curriculum/rows";
import type { PipelineBinding, PipelineMap, PipelineStep } from "@/lib/topic-pipeline";
import { cn } from "@/lib/utils";

// Maarif (9th/10th/11th grade) Kaynak Takibi body, laid out like a
// spreadsheet with merged cells: every SUBTOPIC is its own <tr>, the unit's
// title is written once as a rowSpan cell on the left, "Okul İlerlemesi"
// (the one subtopic-level step) gets a checkbox per subtopic row, and every
// unit-level column (Soru Dağılımı, Konu Çalışması, Çıkmış Sorular, and each
// resource's Soru Çözümü / Kaynak Taraması) is a single rowSpan cell
// spanning the whole unit. Shared by the student's and the coach's tables so both read
// identically; the header row stays in each table (it's the same columns).

// The Ünite column's fixed width, shared with the tables' own sticky header
// cells so the sticky Konu column's `left` offset always matches it.
export const MAARIF_UNIT_COL_CLASS = "w-36 min-w-36 max-w-36";
export const MAARIF_KONU_STICKY_LEFT_CLASS = "left-36";
export const MAARIF_STAT_HEAD_CLASSES = { total: "w-11 min-w-11 px-0.5 text-[11px]", count: "w-7 min-w-7 px-0.5 text-[11px]" };

type Stat = { total: number; correct: number; wrong: number; empty: number };

// Deliberately tiny -- the least horizontal space of any column. In the body
// it is one rowSpan block per unit (question stats are tracked per unit);
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

// A unit's stat = the sum over every real subtopic id it rolls up.
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
  // unit's representative id (row.id) for the unit-level steps.
  pipeline: PipelineBinding;
  collapsedMap: PipelineMap;
  onToggleProgress: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
}) {
  function stepCell(step: PipelineStep, stepIndex: number, row: SelectionRow, topicId: string, name: string, isFirstRow: boolean) {
    const border = stepIndex === 0 && "border-l";
    if (step.key === "okul_ilerlemesi") {
      return (
        <TableCell key={step.key} className={cn("px-3 py-1 text-center", border)}>
          <Checkbox
            checked={pipeline.map[topicId]?.okul_ilerlemesi ?? false}
            onCheckedChange={() => pipeline.onToggle(topicId, "okul_ilerlemesi")}
            aria-label={`${courseName} - ${row.label} - ${name} - ${step.label}`}
          />
        </TableCell>
      );
    }
    if (!isFirstRow) return null;
    return (
      <TableCell key={step.key} rowSpan={row.memberTopicIds.length} className={cn("text-center", border)}>
        <Checkbox
          checked={collapsedMap[row.id]?.[step.key] ?? false}
          onCheckedChange={() => pipeline.onToggle(row.id, step.key)}
          aria-label={`${courseName} - ${row.label} - ${step.label}`}
        />
      </TableCell>
    );
  }

  return (
    <>
      {rows.map((row) => {
        const count = row.memberTopicIds.length;
        return row.memberTopicIds.map((topicId, i) => {
          const name = row.readOnlyNames[i] ?? row.label;
          const isFirstRow = i === 0;
          const isLastRow = i === count - 1;
          return (
            <TableRow key={topicId} className={cn(!isLastRow && "border-border/40")}>
              {isFirstRow && <MaarifStatCells stat={sumStats(topicStats, row.memberTopicIds)} rowSpan={count} />}
              {isFirstRow && (
                <TableCell
                  rowSpan={count}
                  className={cn(
                    "bg-card sticky left-0 z-10 border-r border-l px-3 py-2 text-sm font-medium whitespace-normal",
                    MAARIF_UNIT_COL_CLASS,
                  )}
                >
                  <UnitLabel label={row.label} />
                </TableCell>
              )}
              <TableCell
                className={cn(
                  "bg-card sticky z-10 min-w-56 border-r px-3 py-1.5 text-sm whitespace-normal",
                  MAARIF_KONU_STICKY_LEFT_CLASS,
                )}
              >
                {name}
              </TableCell>
              {pipeline.config.start.map((step, si) => stepCell(step, si, row, topicId, name, isFirstRow))}
              {isFirstRow &&
                resources.map((resource) => {
                  const solved = row.memberTopicIds.some((id) => progress[`${id}::${resource.id}`]?.solved);
                  const reviewed = row.memberTopicIds.some((id) => progress[`${id}::${resource.id}`]?.reviewed);
                  return (
                    <Fragment key={resource.id}>
                      <TableCell rowSpan={count} className="border-l text-center">
                        <Checkbox
                          checked={solved}
                          onCheckedChange={() => onToggleProgress(row.id, resource.id, "solved")}
                          aria-label={`${courseName} - ${row.label} - ${resource.name} - Soru Çözümü`}
                        />
                      </TableCell>
                      <TableCell rowSpan={count} className="text-center">
                        <Checkbox
                          checked={reviewed}
                          onCheckedChange={() => onToggleProgress(row.id, resource.id, "reviewed")}
                          aria-label={`${courseName} - ${row.label} - ${resource.name} - Kaynak Taraması Yapıldı`}
                        />
                      </TableCell>
                    </Fragment>
                  );
                })}
              {pipeline.config.end.map((step, si) => stepCell(step, si, row, topicId, name, isFirstRow))}
            </TableRow>
          );
        });
      })}
    </>
  );
}
