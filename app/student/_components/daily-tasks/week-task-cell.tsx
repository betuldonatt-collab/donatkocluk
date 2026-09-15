"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Lock,
  MinusCircle,
  PlayCircle,
  Sparkles,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
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

// Compact task box for a single day cell in the weekly matrix -- same
// click/keyboard behavior as TaskCard (opens the same TaskModal), but a
// much smaller footprint so several fit inside one grid column.
export function WeekTaskCell({ task, onClick }: { task: StudentTask; onClick: () => void }) {
  const Icon = TASK_TYPE_ICONS[task.task_type];
  const isDone = task.status === "done" || task.completed;
  const isHalfDone = !isDone && task.status === "half_done";
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

  return (
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
        "border-border hover:bg-accent/40 w-full cursor-pointer rounded-md border p-2 text-left transition-colors",
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
            <p className="text-foreground min-w-0 flex-1 break-words text-xs font-semibold leading-snug">
              {cLabel ?? task.title}
            </p>
            {task.week_locked ? (
              <Lock className="text-amber-600 size-2.5 shrink-0" aria-label="Hafta kilitli, salt okunur" />
            ) : (
              task.is_coach_assigned && (
                <Lock className="text-muted-foreground size-2.5 shrink-0" aria-label="Koç tarafından atandı" />
              )
            )}
          </div>

          {topic && (
            <p className={cn("text-[11px] leading-snug break-words", topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground")}>
              {topic.name}
            </p>
          )}

          <p className="text-muted-foreground text-[10px] leading-snug break-words">
            {task.rejected_at ? (task.rejection_reason ?? "Koçun tarafından reddedildi.") : cellSubtitle(task)}
          </p>

          {/* Each link's own title, clamped to 2 lines rather than a bare
              count -- readable at a glance without needing to open the
              cell first. Toggling watched itself still only happens in
              TaskModal; this is read+navigate only, same division as
              TaskCard's own video badges. */}
          {task.video_links.length > 0 && (
            <div className="mt-0.5 flex flex-col gap-0.5">
              {task.video_links.map((link, i) => (
                <a
                  key={link.url + i}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex items-start gap-0.5 rounded px-1 py-0.5 text-[9px] leading-snug",
                    link.watched ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-600",
                  )}
                >
                  <PlayCircle className="mt-0.5 size-2.5 shrink-0" />
                  <span className="line-clamp-2 break-words">{link.title || "Video"}</span>
                </a>
              ))}
            </div>
          )}

          {task.analysis_pending && (
            <span className="mt-0.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
              Analiz bekliyor
            </span>
          )}
          {task.rejected_at && (
            <span className="mt-0.5 inline-block rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-medium text-rose-700">
              Reddedildi
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
