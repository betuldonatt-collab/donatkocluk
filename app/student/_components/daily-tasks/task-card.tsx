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
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FocusTimerTrigger } from "../focus-timer/focus-timer-trigger";
import { examTintClass, statusBorderClass, TASK_TYPE_LABELS, type StudentTask } from "./types";

const TASK_TYPE_ICONS = {
  question_bank: BookOpenCheck,
  video: Video,
  topic_study: ClipboardList,
  branch_exam: Sparkles,
  general_exam: Sparkles,
  extra_custom: ClipboardList,
};

function taskSubtitle(task: StudentTask): string {
  switch (task.task_type) {
    case "question_bank":
    case "branch_exam":
      if (task.correct_count !== null || task.total_count !== null) {
        return `D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}`;
      }
      return TASK_TYPE_LABELS[task.task_type];
    case "general_exam": {
      if (task.subject_scores) {
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
      // Falls back to the flat columns when a coach entered this exam's
      // result via the kanban's own trial-results-section.tsx, which
      // writes total/correct/wrong/empty_count directly and never touches
      // subject_scores -- without this, a coach-recorded general exam
      // would show no D/Y/B at all on the student's own dashboard card.
      if (task.correct_count !== null || task.total_count !== null) {
        return `D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}`;
      }
      return TASK_TYPE_LABELS[task.task_type];
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

export function TaskCard({ task, onClick }: { task: StudentTask; onClick: () => void }) {
  const Icon = TASK_TYPE_ICONS[task.task_type];
  const isDone = task.status === "done" || task.completed;
  const isHalfDone = !isDone && task.status === "half_done";

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
        "border-border hover:bg-accent/40 flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        task.rejected_at ? "bg-rose-500/5" : examTintClass(task),
        statusBorderClass(task) && cn("border-l-4", statusBorderClass(task)),
        task.rejected_at && "border-l-4 border-l-rose-400",
        (task.week_locked || task.rejected_at) && "opacity-70",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isDone
            ? "bg-emerald-500/15 text-emerald-600"
            : isHalfDone
              ? "bg-amber-500/15 text-amber-600"
              : "bg-primary/10 text-primary",
        )}
      >
        {isDone ? <CheckCircle2 className="size-5" /> : isHalfDone ? <MinusCircle className="size-5" /> : <Icon className="size-5" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-foreground truncate text-sm font-medium">{task.title}</p>
          {task.week_locked ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              aria-label="Hafta kilitli, salt okunur"
            >
              <Lock className="size-2.5" />
              Kilitli
            </span>
          ) : (
            task.is_coach_assigned && (
              <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Koç tarafından atandı" />
            )
          )}
          {task.analysis_pending && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              Analiz bekliyor
            </span>
          )}
          {task.rejected_at && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
              <XCircle className="size-2.5" />
              Reddedildi
            </span>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {task.rejected_at ? (task.rejection_reason ?? "Koçun tarafından reddedildi.") : taskSubtitle(task)}
        </p>
        {task.video_links.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {task.video_links.map((link, i) => (
              <a
                key={link.url + i}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug",
                  link.watched ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-600",
                )}
              >
                <PlayCircle className="size-3 shrink-0" />
                <span className="truncate">{link.title || "Video"}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <FocusTimerTrigger task={task} className="hidden shrink-0 sm:flex" />
    </div>
  );
}
