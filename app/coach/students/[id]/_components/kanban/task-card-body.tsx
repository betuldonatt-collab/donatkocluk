import { Check, Minus, PlayCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import type { AssignedTaskStatus } from "../../../../actions";
import type { DetailTask } from "../../types";

export const TASK_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Çalışması",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
};

export function courseLabel(courseId: string | null) {
  const course = findCourseById(courseId);
  if (!course) return null;
  const prefix = courseId?.startsWith("tyt-") ? "TYT " : courseId?.startsWith("ayt-") ? "AYT " : "";
  return `${prefix}${course.name}`;
}

export function statusClasses(task: DetailTask) {
  const isDone = task.status === "done" || task.completed;
  if (isDone) return "border-l-2 border-l-emerald-500";
  if (task.status === "half_done") return "border-l-2 border-l-amber-500";
  if (task.status === "not_done") return "border-l-2 border-l-rose-500";
  return "";
}

// Deneme cards get a distinct pastel navy tint so they stand out from
// regular task cards at a glance; opacity-based (not a flat bg-blue-50)
// so it stays theme-safe in dark mode like the rest of the app's tinting.
// Indigo (not slate) is the hue -- slate reads as plain gray, indigo
// reads as navy blue even at low opacity.
export function cardBackgroundClass(task: DetailTask) {
  if (task.task_type === "general_exam") return "bg-indigo-500/20";
  if (task.task_type === "branch_exam") return "bg-indigo-500/10";
  return "bg-card";
}

const STATUS_OPTIONS: { value: AssignedTaskStatus; label: string; icon: typeof Check; activeClass: string }[] = [
  { value: "done", label: "Yapıldı", icon: Check, activeClass: "bg-emerald-500/20 text-emerald-600" },
  { value: "half_done", label: "Yarım", icon: Minus, activeClass: "bg-amber-500/20 text-amber-600" },
  { value: "not_done", label: "Yapılmadı", icon: X, activeClass: "bg-rose-500/20 text-rose-600" },
];

// Coach status override -- Yapıldı/Yarım/Yapılmadı, written straight to
// student_tasks.status without opening the drawer, independent of
// whatever the student has (or hasn't) checked off themselves.
export function TaskStatusButtons({
  task,
  onStatusChange,
}: {
  task: DetailTask;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
}) {
  return (
    <div className="mt-1.5 flex gap-1">
      {STATUS_OPTIONS.map(({ value, label, icon: Icon, activeClass }) => (
        <button
          key={value}
          type="button"
          onClick={() => onStatusChange(task, value)}
          title={label}
          aria-label={label}
          className={cn(
            "flex flex-1 items-center justify-center rounded py-1 transition-colors",
            task.status === value ? activeClass : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          <Icon className="size-3" />
        </button>
      ))}
    </div>
  );
}

// Shared 3-tier info block -- course name (bold), topic name (lighter),
// target details + video links (smallest). No truncation anywhere: every
// row wraps instead of clipping. Shared by KanbanTaskCard (draggable, in
// a day column) and RoutineTaskCard (static, in the Rutinler lane) so
// the two stay visually identical.
export function TaskCardBody({ task, resourceNameById }: { task: DetailTask; resourceNameById?: Map<string, string> }) {
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

  // The generic type label ("Soru Çözümü") is a placeholder for what's
  // actually assigned -- once real resources are linked, their names are
  // strictly more useful and replace it (falling back to the label for
  // any id that didn't resolve, e.g. a resource deleted after linking).
  const resourceNames = task.resource_ids
    .map((id) => resourceNameById?.get(id))
    .filter((name): name is string => !!name);
  const subtitle = resourceNames.length > 0 ? resourceNames.join(" + ") : (TASK_TYPE_LABELS[task.task_type] ?? task.task_type);
  const countUnit = task.task_type === "branch_exam" ? "adet" : "soru";

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-foreground text-sm leading-snug font-semibold break-words">{cLabel ?? task.title}</p>

      {topic && (
        <p
          className={cn(
            "text-xs leading-snug break-words",
            topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground",
          )}
        >
          {topic.name}
        </p>
      )}

      <p className="text-muted-foreground text-[11px] leading-snug break-words">
        {subtitle}
        {task.total_count !== null && ` · ${task.total_count} ${countUnit}`}
        {task.duration_minutes !== null && ` · ${task.duration_minutes} dk`}
      </p>

      {task.video_links.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          {task.video_links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="bg-rose-500/10 text-rose-600 inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug"
            >
              <PlayCircle className="mt-0.5 size-3 shrink-0" />
              <span className="break-words">{link.title || "Video"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
