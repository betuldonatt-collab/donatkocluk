"use client";

import { useState } from "react";
import {
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Lock,
  MinusCircle,
  PlayCircle,
  Sparkles,
  Timer,
  TrendingUp,
  Video,
  XCircle,
} from "lucide-react";

import { TaskDescription } from "@/components/task-description";
import { cn } from "@/lib/utils";
import { FocusTimerTrigger } from "../focus-timer/focus-timer-trigger";
import { statusBorderClass, subjectTintClass, TASK_TYPE_LABELS, type StudentTask } from "./types";

const TASK_TYPE_ICONS = {
  question_bank: BookOpenCheck,
  video: Video,
  topic_study: ClipboardList,
  branch_exam: Sparkles,
  general_exam: Sparkles,
  extra_custom: ClipboardList,
  reading: BookOpen,
};

// Coach-set target (or, once the student records it via task-modal.tsx's
// own Süre field on a TYT branch exam, the actual time taken) -- shown
// wherever it's set, appended the same way the coach's own card does
// (task-card-body.tsx's subtitleText). Previously never surfaced anywhere
// on the student side at all.
function durationSuffix(task: StudentTask): string {
  return task.duration_minutes !== null ? ` · ${task.duration_minutes} dk` : "";
}

// Actual time SPENT on this task via Süre Tut (task.tracked_duration_minutes)
// -- distinct from duration_minutes above, which is the coach's assigned
// target/estimate, not what was really tracked. Same "45 dk" / "1 sa 15 dk"
// convention as focus-timer-trigger.tsx's own formatMinutesLabel (kept as a
// separate copy here rather than imported -- this repo's own convention for
// small per-view formatters, see that file's and week-task-cell.tsx's
// matching comments elsewhere).
function formatTrackedTime(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

function taskSubtitle(task: StudentTask): string {
  switch (task.task_type) {
    case "question_bank":
    case "branch_exam": {
      // The assigned target (e.g. "40 soru") -- unlike general_exam below,
      // this IS a real pre-assigned goal here, not a computed result, so
      // it has to stay visible once progress starts, not get replaced by
      // it. Previously this branch swapped straight to the D/Y/B readout
      // the moment any count existed, silently dropping the number a
      // student was actually responsible for.
      const countUnit = task.task_type === "branch_exam" ? "adet" : "soru";
      const target = task.total_count !== null ? `${task.total_count} ${countUnit}` : "";
      if (task.correct_count !== null || task.total_count !== null) {
        const progress = `D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}`;
        return `${target ? `${target} · ` : ""}${progress}${durationSuffix(task)}`;
      }
      // No count target at all -- still show a duration-only target
      // (e.g. "solve for 45 minutes", no fixed question count) instead of
      // a bare type label with no goal in sight.
      return `${TASK_TYPE_LABELS[task.task_type]}${durationSuffix(task)}`;
    }
    case "reading": {
      // Simpler than question_bank/branch_exam above -- reading has no
      // Doğru/Yanlış/Boş concept, just how many pages got read against
      // the (optional) page target, e.g. "120/250 sayfa" once progress
      // starts, or just the bare target/type label before it does.
      const target = task.total_count !== null ? `/${task.total_count}` : "";
      if (task.correct_count !== null) {
        return `${task.correct_count}${target} sayfa${durationSuffix(task)}`;
      }
      if (task.total_count !== null) {
        return `${task.total_count} sayfa${durationSuffix(task)}`;
      }
      return `${TASK_TYPE_LABELS[task.task_type]}${durationSuffix(task)}`;
    }
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
        return `D:${totals.correct} Y:${totals.wrong} B:${totals.empty}${durationSuffix(task)}`;
      }
      // Falls back to the flat columns when a coach entered this exam's
      // result via the kanban's own trial-results-section.tsx, which
      // writes total/correct/wrong/empty_count directly and never touches
      // subject_scores -- without this, a coach-recorded general exam
      // would show no D/Y/B at all on the student's own dashboard card.
      if (task.correct_count !== null || task.total_count !== null) {
        return `D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}${durationSuffix(task)}`;
      }
      return TASK_TYPE_LABELS[task.task_type];
    }
    case "video":
    case "topic_study": {
      const isVideo = task.task_type === "video";
      // Derived from task.status, not task.completed -- a dual task's
      // merged outcome (mergeDualTaskStatus, updateTaskProgress) only
      // ever gets written to status, never to completed, so checking
      // completed here silently showed "Tamamlanmadı"/"İzlenmedi" for a
      // dual task even once it was genuinely done. This also recovers
      // the "Yapılmadı" case, previously indistinguishable from a task
      // nobody had touched yet.
      const manual =
        task.status === "done"
          ? isVideo
            ? "İzlendi"
            : "Tamamlandı"
          : task.status === "half_done"
            ? isVideo
              ? "Yarım İzlendi"
              : "Yarım Tamamlandı"
            : task.status === "not_done"
              ? "Yapılmadı"
              : isVideo
                ? "İzlenmedi"
                : "Tamamlanmadı";
      // A "dual" task (Focus Timer plan: a video/topic-study task that
      // also carries a question-count target) -- the manual watched/
      // completed status alone used to be the ONLY thing shown here, with
      // no sign at all of the question-count half's own progress.
      if (task.total_count !== null) {
        return `${manual} · D:${task.correct_count ?? "-"} Y:${task.wrong_count ?? "-"} B:${task.empty_count ?? "-"}${durationSuffix(task)}`;
      }
      return `${manual}${durationSuffix(task)}`;
    }
    default:
      return `${TASK_TYPE_LABELS[task.task_type]}${durationSuffix(task)}`;
  }
}

export function TaskCard({
  task,
  onClick,
  showTimer = true,
  impactHint,
}: {
  task: StudentTask;
  onClick: () => void;
  // e.g. "Bu görevi tamamladığında bugünkü ilerlemene yaklaşık %30 ekleyeceksin"
  // (see lib/effort-weight.ts). Null/absent hides it.
  impactHint?: string | null;
  // Süre Tut is restricted to the real, current day (see TaskBoard's
  // canUseTimer) -- a student can't retroactively time something they
  // already did yesterday, or pre-log time on a task that hasn't happened
  // yet. Defaults true so this card's other callers (if any) are unaffected.
  showTimer?: boolean;
}) {
  const Icon = TASK_TYPE_ICONS[task.task_type];
  const isDone = task.status === "done" || task.completed;
  const isHalfDone = !isDone && task.status === "half_done";
  // Below md, a scrolling finger landing on a card used to get "caught" --
  // dnd-kit's own touch-drag collision is fixed separately (TaskBoard's
  // sensors), but a long title/description could ALSO make cards grow to
  // very different heights, which is its own source of a janky mobile
  // scroll. Below md, title/description are clamped to a fixed size by
  // default; holding a finger down on the card (onTouchStart/onTouchEnd,
  // never mouse -- see the className below) reveals the full text for as
  // long as the touch lasts, then snaps back the instant it's released.
  // md and up are untouched: no clamp there at all, regardless of this
  // state, so desktop/tablet behavior is exactly what it was before.
  const [isPressed, setIsPressed] = useState(false);

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
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      className={cn(
        "border-border hover:bg-accent/40 flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        task.rejected_at ? "bg-rose-500/5" : subjectTintClass(task),
        statusBorderClass(task),
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
        {/* items-start (not -center): on md+ the title wraps freely (no
            line-clamp cap there) so a long course+topic combination is
            never cut off -- centering these badges against a
            possibly-taller title would float them awkwardly mid-block.
            flex-wrap: up to 4 shrink-0 badges (tracked time, locked,
            analiz bekliyor, evidence status...) can appear at once --
            without wrapping, a narrow phone had nowhere for their
            combined width to go but past the card's own edge. */}
        <div className="flex flex-wrap items-start gap-1.5">
          <p
            className={cn(
              "text-foreground min-w-0 flex-1 text-sm font-medium break-words md:line-clamp-none",
              isPressed ? "line-clamp-none" : "line-clamp-2",
            )}
          >
            {task.title}
          </p>
          {/* Only when time has actually been logged via Süre Tut -- unlike
              FocusTimerTrigger's own inline duration (which this replaces,
              see that file), this stays visible even once the task is
              done, so a student can still see at a glance what they spent
              on it. */}
          {task.tracked_duration_minutes > 0 && (
            <span
              className="bg-secondary text-muted-foreground inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
              title="Bu görevde Süre Tut ile geçirilen toplam süre"
            >
              <Timer className="size-2.5" />
              {formatTrackedTime(task.tracked_duration_minutes)}
            </span>
          )}
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
          {task.evidence_review_status === "pending" && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Koç onayı bekleniyor
            </span>
          )}
          {task.evidence_review_status === "rejected" && (
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
              Fotoğraflar onaylanmadı
            </span>
          )}
          {task.evidence_review_status === "approved" && (task.evidence_image_paths?.length ?? 0) > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Fotoğraflar onaylandı
            </span>
          )}
        </div>
        {/* The coach's note, right under the title (line breaks kept). */}
        {/* isPressed only ever becomes true via a real touchstart (see
            above) -- a mouse-only desktop session never sets it, so this
            stays exactly lines={3} there, unchanged. */}
        <TaskDescription text={task.description} lines={isPressed ? "all" : 3} className="mt-0.5" />
        {impactHint && (
          <p className="bg-primary/10 text-foreground mt-1.5 flex w-fit max-w-full items-start gap-1.5 rounded-md px-2 py-1 text-xs font-medium break-words">
            <TrendingUp className="text-primary mt-0.5 size-3.5 shrink-0" />
            <span>{impactHint}</span>
          </p>
        )}
        {/* Which book/kaynak the coach linked, if any -- previously
            invisible anywhere in the student panel, including the full
            task modal (traced to the fetch itself never joining
            task_resources; see resource_names on StudentTask). */}
        {task.resource_names.length > 0 && (
          <p className="text-muted-foreground text-xs break-words">{task.resource_names.join(" + ")}</p>
        )}
        <p className="text-muted-foreground text-xs break-words">
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
                <span className="break-words">{link.title || "Video"}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Hidden once the task is done -- nothing left to time. Otherwise
          always visible -- was `hidden sm:flex`, which hid it on mobile
          portrait (most phones sit below the 640px sm breakpoint in
          portrait but cross it in landscape), making the button appear
          to only work in landscape. The row copes with the narrower
          space via the title's own free wrapping. */}
      {showTimer && !isDone && <FocusTimerTrigger task={task} className="flex shrink-0" />}
    </div>
  );
}
