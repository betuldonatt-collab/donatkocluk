"use client";

import { Fragment, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import type { Course } from "@/lib/curriculum";
import type { SelectionRow } from "@/lib/curriculum/rows";
import {
  allPipelineSteps,
  summarizePipeline,
  type PipelineConfig,
  type PipelineMap,
  type PipelineStep,
  type PipelineStepKey,
} from "@/lib/topic-pipeline";
import { cn } from "@/lib/utils";

// Building blocks for the per-topic pipeline columns of the Kaynak Takibi
// table, shared by the student's and the coach's tables (both cohorts) so they
// read identically. The tables have a two-row header, so each step head spans
// both rows (rowSpan 2) instead of needing a sub-head of its own.
//
// Layout contract: the cohort's `start` steps render right after the topic
// cell (before every resource column), its `end` steps after the last
// resource column. The first column of each group gets a left border to
// separate it from its neighbours.

export function PipelineStepHeads({ steps }: { steps: readonly PipelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <TableHead
          key={step.key}
          rowSpan={2}
          className={cn("h-auto min-w-20 py-2 text-center align-bottom text-xs whitespace-normal", i === 0 && "border-l")}
        >
          {step.label}
        </TableHead>
      ))}
    </>
  );
}

// One body row's checkboxes for a group of steps.
export function PipelineCells({
  steps,
  courseName,
  topicName,
  topicId,
  map,
  onToggle,
  renderCustomCell,
}: {
  steps: readonly PipelineStep[];
  courseName: string;
  topicName: string;
  topicId: string;
  map: PipelineMap;
  onToggle: (topicId: string, step: PipelineStepKey) => void;
  // Lets a caller substitute a specific step's whole cell (e.g. the Maarif
  // cohort's "Okul İlerlemesi" step, which needs one checkbox per raw
  // subtopic instead of this row's single collapsed one -- see
  // MaarifOkulIlerlemesiCell below) while every other step still renders
  // normally, in the exact same column position/order the header
  // (PipelineStepHeads, rendered from this same unfiltered `steps` list)
  // already laid out. Returning undefined keeps the normal checkbox cell.
  renderCustomCell?: (step: PipelineStep, index: number) => ReactNode | undefined;
}) {
  const state = map[topicId];
  return (
    <>
      {steps.map((step, i) => {
        const custom = renderCustomCell?.(step, i);
        if (custom !== undefined) return <Fragment key={step.key}>{custom}</Fragment>;
        return (
          <TableCell key={step.key} className={cn("text-center", i === 0 && "border-l")}>
            <Checkbox
              checked={state?.[step.key] ?? false}
              onCheckedChange={() => onToggle(topicId, step.key)}
              aria-label={`${courseName} - ${topicName} - ${step.label}`}
            />
          </TableCell>
        );
      })}
    </>
  );
}

// The Maarif cohort's "Okul İlerlemesi" step tracks what was actually
// covered in the student's own school classes -- unlike every other
// pipeline step (collapsed to one checkbox per Kaynak Takibi unit row, see
// lib/curriculum/maarif-selection.ts), a teacher can cover some subtopics
// of a unit and not others, so this one needs real subtopic granularity.
// Renders its own checklist, one checkbox per real topic the row rolls up
// (same names/order as ReadOnlySubtopics' plain list), reading/writing the
// RAW (uncollapsed) pipeline map directly by each topic's own real id --
// never the row's single representative id the other steps use.
export function MaarifOkulIlerlemesiCell({
  isFirst,
  courseName,
  row,
  map,
  onToggle,
}: {
  isFirst: boolean;
  courseName: string;
  row: SelectionRow;
  map: PipelineMap;
  onToggle: (topicId: string, step: PipelineStepKey) => void;
}) {
  return (
    <TableCell className={cn("text-left align-top", isFirst && "border-l")}>
      <div className="flex flex-col gap-1">
        {row.memberTopicIds.map((topicId, i) => {
          const name = row.readOnlyNames[i] ?? row.label;
          return (
            <label key={topicId} className="flex items-start gap-1.5 text-xs leading-snug">
              <Checkbox
                className="mt-0.5"
                checked={map[topicId]?.okul_ilerlemesi ?? false}
                onCheckedChange={() => onToggle(topicId, "okul_ilerlemesi")}
                aria-label={`${courseName} - ${row.label} - ${name} - Okul İlerlemesi`}
              />
              <span>{name}</span>
            </label>
          );
        })}
      </div>
    </TableCell>
  );
}

// Filler for rows with no pipeline of their own (the Karma row).
export function PipelineFillerCell({ count }: { count: number }) {
  if (count === 0) return null;
  return <TableCell colSpan={count} className="border-l" />;
}

// "How far through this subject is the student": per-step and fully-done
// counts, so nobody has to count ticks down a long table.
export function PipelineSummaryBar({ course, map, config }: { course: Course; map: PipelineMap; config: PipelineConfig }) {
  const summary = summarizePipeline(course, map, config);
  if (summary.totalTopics === 0) return null;
  const steps = allPipelineSteps(config);
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-foreground text-sm font-semibold">Konu İşleyiş Borusu</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          Tüm adımları tamamlanan konu: <span className="text-foreground font-semibold">{summary.completed}</span> /{" "}
          {summary.totalTopics}
        </p>
      </div>
      <div className={cn("grid gap-3", steps.length > 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}>
        {steps.map((step) => {
          const done = summary.perStep[step.key] ?? 0;
          const pct = Math.round((done / summary.totalTopics) * 100);
          return (
            <div key={step.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="text-foreground font-medium tabular-nums">
                  {done}/{summary.totalTopics}
                </span>
              </div>
              <div
                className="bg-secondary h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${step.label} ilerlemesi`}
              >
                <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
