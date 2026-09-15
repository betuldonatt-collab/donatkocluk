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
import { ResizeHandle } from "@/components/ui/resize-handle";
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

// The floor a student can drag a cell down to (see ResizeHandle in
// task-board.tsx) -- just tall enough to always fit the icon + one
// truncated title line, which never clips (see WeekTaskCell below).
// Mirrors the DB check constraint (schedule_card_height_px_floor,
// migration 0076) with this panel's own, already-tighter cell chrome.
export const MIN_CELL_HEIGHT_PX = 64;
// This panel's own starting height when a student has never dragged a
// cell yet (profiles.schedule_card_height_px is null) -- see
// app/student/page.tsx.
export const DEFAULT_CELL_HEIGHT_PX = 108;

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

// A single colorful pill -- shared by an individual video's title AND the
// "N video" summary badge, so every video-related indicator on a cell
// (whichever one applies) reads as the same visual language as the full
// list shown in WeekCellHoverDetail on hover. Mirrors the coach panel's
// own VideoPill (task-card-body.tsx) at this grid's own smaller scale.
function VideoPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-rose-500/10 text-rose-600 mt-0.5 inline-flex max-w-full items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-snug">
      <PlayCircle className="size-2.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

// Default-state video indicator: 1 video shows its own title (as a real
// link); 2+ collapse into a single "N video" summary pill rather than
// stacking individual titles -- the cell's height is a free drag, not a
// fixed tier, so there's no fixed row budget to cap against, just no
// appetite for an unbounded stack of video rows. Always exactly one line,
// truncated (or clipped by the cell's own overflow-hidden) if it doesn't
// fit. Full untruncated list is always one hover away (WeekCellHoverDetail).
function WeekCellVideoLinks({ videoLinks }: { videoLinks: StudentTask["video_links"] }) {
  if (videoLinks.length === 0) return null;
  if (videoLinks.length === 1) {
    const link = videoLinks[0];
    return (
      <a href={link.url} target="_blank" rel="noreferrer" className="block max-w-full">
        <VideoPill>{link.title || "Video"}</VideoPill>
      </a>
    );
  }
  return <VideoPill>{videoLinks.length} video</VideoPill>;
}

// Full, untruncated detail shown on hover -- same fields as the compact
// cell, no truncation, every video link's full title plus its watched
// state, and the complete analysis/rejection text where the compact cell
// only has room for an icon.
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
// much smaller footprint so several fit inside one grid column. Title,
// topic, subtitle, and the video indicator are always rendered as a
// single truncated (ellipsis) line -- the cell's fixed-but-draggable
// height + overflow-hidden clip whichever rows don't fit when dragged
// short. The full, untruncated version is one hover away via
// WeekCellHoverDetail.
export function WeekTaskCell({
  task,
  onClick,
  height,
  onResize,
  onResizeEnd,
}: {
  task: StudentTask;
  onClick: () => void;
  // Current height in px for the ROW this cell is in (its position within
  // whichever lane rendered it -- see routineRows/taskRows in
  // task-board.tsx), and the drag callbacks (see ResizeHandle). Every
  // cell and placeholder at that same row index, across all 7 days,
  // shares this value -- dragging this cell's handle only ever resizes
  // its own row, leaving every other row untouched, like dragging one row
  // boundary in a spreadsheet.
  height: number;
  onResize: (deltaY: number) => void;
  onResizeEnd: () => void;
}) {
  const Icon = TASK_TYPE_ICONS[task.task_type];
  const isDone = task.status === "done" || task.completed;
  const isHalfDone = !isDone && task.status === "half_done";
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

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
          style={{ height }}
          className={cn(
            "border-border hover:bg-accent/40 relative flex w-full cursor-pointer flex-col overflow-hidden rounded-md border p-2 text-left transition-colors",
            task.rejected_at ? "bg-rose-500/5" : examTintClass(task),
            statusBorderClass(task) && cn("border-l-2", statusBorderClass(task)),
            task.rejected_at && "border-l-2 border-l-rose-400",
            (task.week_locked || task.rejected_at) && "opacity-70",
          )}
        >
          <div className="flex min-h-0 flex-1 items-start gap-1.5 overflow-hidden">
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

            <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
              <div className="flex items-center gap-1">
                <p className="text-foreground min-w-0 flex-1 truncate text-xs font-semibold leading-snug">{cLabel ?? task.title}</p>
                {/* Icon-only indicators (never a text badge row) -- keeps
                    every state, including the rarer analysis-pending /
                    rejected ones, inside a single title-row's height.
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

              {topic && (
                <p className={cn("truncate text-[11px] leading-snug", topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                  {topic.name}
                </p>
              )}

              <p className="text-muted-foreground truncate text-[10px] leading-snug">
                {task.rejected_at ? (task.rejection_reason ?? "Koçun tarafından reddedildi.") : cellSubtitle(task)}
              </p>

              <WeekCellVideoLinks videoLinks={task.video_links} />
            </div>
          </div>

          <ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} label="Bu satırın yüksekliğini ayarla" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent>
        <WeekCellHoverDetail task={task} />
      </HoverCardContent>
    </HoverCard>
  );
}
