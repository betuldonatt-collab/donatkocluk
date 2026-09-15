"use client";

import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Lock,
  MinusCircle,
  PlayCircle,
  Sparkles,
  Video,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ScheduleDensity } from "@/lib/schedule-density";
import { examTintClass, statusBorderClass, TASK_TYPE_LABELS, type StudentTask } from "./types";

// Same courseLabel convention as the coach's TaskCardBody
// (app/coach/students/[id]/_components/kanban/task-card-body.tsx) --
// duplicated per this repo's panel-UI convention.
function courseLabel(courseId: string | null): string | null {
  const course = findCourseById(courseId);
  if (!course) return null;
  const prefix = courseId?.startsWith("tyt-") ? "TYT " : courseId?.startsWith("ayt-") ? "AYT " : "";
  return `${prefix}${course.name}`;
}

const TASK_TYPE_ICONS = {
  question_bank: BookOpenCheck,
  video: Video,
  topic_study: ClipboardList,
  branch_exam: Sparkles,
  general_exam: Sparkles,
  extra_custom: ClipboardList,
};

// Three content profiles a student can pick (see the "Görünüm" toggle in
// task-board.tsx, persisted to profiles.schedule_density) -- mirrors the
// coach panel's own CARD_DENSITY_CONFIG (task-card-body.tsx) exactly in
// shape, tuned independently for this grid's own, already-tighter default
// size, per this app's per-panel duplication convention. Every cell
// sharing one tier (real cells and the Rutinler-lane placeholders in
// task-board.tsx alike) is always exactly this tall.
export type WeekCellDensity = ScheduleDensity;

type DensityConfig = {
  heightClass: string;
  showTopic: boolean;
  videoRows: 0 | 1;
  videoShowTitles: boolean;
};

export const WEEK_CELL_DENSITY_CONFIG: Record<WeekCellDensity, DensityConfig> = {
  compact: { heightClass: "h-[76px]", showTopic: false, videoRows: 1, videoShowTitles: false },
  medium: { heightClass: "h-[108px]", showTopic: true, videoRows: 1, videoShowTitles: true },
  comfortable: { heightClass: "h-[132px]", showTopic: true, videoRows: 1, videoShowTitles: true },
};

// Same subtitle rules as TaskCard's taskSubtitle, kept in sync deliberately
// rather than shared -- the grid cell is a distinct, much tighter layout
// and the two are free to diverge.
function cellSubtitle(task: StudentTask): string {
  switch (task.task_type) {
    case "question_bank":
    case "branch_exam":
      if (task.correct_count !== null || task.total_count !== null) {
        return `D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}`;
      }
      return TASK_TYPE_LABELS[task.task_type];
    case "general_exam": {
      if (!task.subject_scores) return TASK_TYPE_LABELS[task.task_type];
      const totals = Object.values(task.subject_scores).reduce<{
        correct: number;
        wrong: number;
        empty: number;
      }>(
        (acc, s) => ({
          correct: acc.correct + (s.correct ?? 0),
          wrong: acc.wrong + (s.wrong ?? 0),
          empty: acc.empty + (s.empty ?? 0),
        }),
        { correct: 0, wrong: 0, empty: 0 },
      );
      return `D:${totals.correct} Y:${totals.wrong} B:${totals.empty}`;
    }
    case "video":
      if (task.status === "half_done") return "Yarım İzlendi";
      return task.completed ? "İzlendi" : "İzlenmedi";
    case "topic_study":
      if (task.status === "half_done") return "Yarım Tamamlandı";
      return task.completed ? "Tamamlandı" : "Tamamlanmadı";
    default:
      return task.description ?? TASK_TYPE_LABELS[task.task_type];
  }
}

// Default-state video block, shaped by the density tier -- guaranteed to
// fit its single-row budget regardless of how many links are attached.
// videoShowTitles=false (compact): always a bare "N video" count, never a
// title. Otherwise: 1 video -> its title, clamped to 1 line; 2+ -> a
// "N video eklendi" summary (no individual title -- only one row is
// available). Mirrors the coach panel's own CardVideoLinks exactly, minus
// the 2-row tier (this grid never had one -- see WEEK_CELL_DENSITY_CONFIG).
// The full, untruncated list is always one hover away (WeekCellHoverDetail).
function WeekCellVideoLinks({ videoLinks, density }: { videoLinks: StudentTask["video_links"]; density: WeekCellDensity }) {
  if (videoLinks.length === 0) return null;
  const config = WEEK_CELL_DENSITY_CONFIG[density];
  if (config.videoRows === 0) return null;

  if (!config.videoShowTitles) {
    return (
      <span className="text-muted-foreground mt-0.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-snug">
        <PlayCircle className="size-2.5 shrink-0" />
        {videoLinks.length} video
      </span>
    );
  }

  if (videoLinks.length === 1) {
    const link = videoLinks[0];
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "mt-0.5 flex items-start gap-0.5 rounded px-1 py-0.5 text-[9px] leading-snug",
          link.watched ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-600",
        )}
      >
        <PlayCircle className="mt-0.5 size-2.5 shrink-0" />
        <span className="line-clamp-1 break-words">{link.title || "Video"}</span>
      </a>
    );
  }

  return (
    <span className="text-muted-foreground mt-0.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-snug">
      <PlayCircle className="size-2.5 shrink-0" />
      {videoLinks.length} video eklendi
    </span>
  );
}

// Full, untruncated detail shown on hover -- same fields as the compact
// cell, none of the clamping/density, every video link's full title plus
// its watched state, and the complete analysis/rejection text where the
// compact cell only has room for an icon.
function WeekCellHoverDetail({ task }: { task: StudentTask }) {
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

  return (
    <div className="space-y-1.5">
      <p className="text-foreground text-sm leading-snug font-semibold break-words">{cLabel ?? task.title}</p>
      {topic && (
        <p className={cn("text-xs leading-snug break-words", topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground")}>
          {topic.name}
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-snug break-words">
        {task.rejected_at ? (task.rejection_reason ?? "Koçun tarafından reddedildi.") : cellSubtitle(task)}
      </p>
      {task.video_links.length > 0 && (
        <div className="flex flex-col items-start gap-1 pt-0.5">
          {task.video_links.map((link, i) => (
            <a
              key={link.url + i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-start gap-1 rounded-md px-1.5 py-0.5 text-xs leading-snug",
                link.watched ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-600",
              )}
            >
              <PlayCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{link.title || "Video"}</span>
            </a>
          ))}
        </div>
      )}
      {task.analysis_pending && (
        <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
          <AlertCircle className="size-3.5 shrink-0" />
          Analiz bekliyor
        </p>
      )}
      {task.rejected_at && (
        <p className="flex items-center gap-1 text-xs font-medium text-rose-700">
          <XCircle className="size-3.5 shrink-0" />
          Koç tarafından reddedildi
        </p>
      )}
    </div>
  );
}

// Compact task box for a single day cell in the weekly matrix -- same
// click/keyboard behavior as TaskCard (opens the same TaskModal), but a
// much smaller footprint so several fit inside one grid column. Shaped
// entirely by `density` (see WEEK_CELL_DENSITY_CONFIG); the full,
// untruncated version is one hover away via WeekCellHoverDetail.
export function WeekTaskCell({ task, onClick, density }: { task: StudentTask; onClick: () => void; density: WeekCellDensity }) {
  const Icon = TASK_TYPE_ICONS[task.task_type];
  const isDone = task.status === "done" || task.completed;
  const isHalfDone = !isDone && task.status === "half_done";
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);
  const config = WEEK_CELL_DENSITY_CONFIG[density];

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }}
          className={cn(
            "border-border hover:bg-accent/40 flex w-full cursor-pointer flex-col rounded-md border p-2 text-left transition-colors",
            config.heightClass,
            task.rejected_at ? "bg-rose-500/5" : examTintClass(task),
            statusBorderClass(task) && cn("border-l-2", statusBorderClass(task)),
            task.rejected_at && "border-l-2 border-l-rose-400",
            (task.week_locked || task.rejected_at) && "opacity-70",
          )}
        >
          <div className="flex items-start gap-1.5">
            <div
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                isDone
                  ? "bg-emerald-500/15 text-emerald-600"
                  : isHalfDone
                    ? "bg-amber-500/15 text-amber-600"
                    : "bg-primary/10 text-primary",
              )}
            >
              {isDone ? <CheckCircle2 className="size-3" /> : isHalfDone ? <MinusCircle className="size-3" /> : <Icon className="size-3" />}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1">
                <p className="text-foreground line-clamp-1 min-w-0 flex-1 break-words text-xs font-semibold leading-snug">
                  {cLabel ?? task.title}
                </p>
                {/* Icon-only indicators (never a text badge row) -- keeps
                    every state, including the rarer analysis-pending /
                    rejected ones, inside the same fixed-height budget.
                    Full text for each is always in the hover detail. */}
                {task.analysis_pending && <AlertCircle className="size-2.5 shrink-0 text-amber-600" aria-label="Analiz bekliyor" />}
                {task.rejected_at && <XCircle className="size-2.5 shrink-0 text-rose-600" aria-label="Reddedildi" />}
                {task.week_locked ? (
                  <Lock className="text-amber-600 size-2.5 shrink-0" aria-label="Hafta kilitli, salt okunur" />
                ) : (
                  task.is_coach_assigned && (
                    <Lock className="text-muted-foreground size-2.5 shrink-0" aria-label="Koç tarafından atandı" />
                  )
                )}
              </div>

              {config.showTopic && topic && (
                <p className={cn("line-clamp-1 text-[11px] leading-snug break-words", topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                  {topic.name}
                </p>
              )}

              <p className="text-muted-foreground line-clamp-1 text-[10px] leading-snug break-words">
                {task.rejected_at ? (task.rejection_reason ?? "Koçun tarafından reddedildi.") : cellSubtitle(task)}
              </p>

              <WeekCellVideoLinks videoLinks={task.video_links} density={density} />
            </div>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent>
        <WeekCellHoverDetail task={task} />
      </HoverCardContent>
    </HoverCard>
  );
}
