import { PlayCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
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

// The floor a coach can drag a card down to (see ResizeHandle in
// kanban-task-card.tsx/routine-task-card.tsx) -- just tall enough to
// always fit the icon + one truncated title line + the action-icon row,
// which never clip (see TaskCardBody below). Mirrors the DB check
// constraint (schedule_card_height_px_floor, migration 0076) with extra
// headroom for this panel's own, slightly larger card chrome.
export const MIN_CARD_HEIGHT_PX = 84;
// This panel's own starting height when a coach has never dragged a
// card yet (profiles.schedule_card_height_px is null) -- see
// schedule/page.tsx.
export const DEFAULT_CARD_HEIGHT_PX = 144;

function subtitleText(task: DetailTask, resourceNameById?: Map<string, string>): string {
  // The generic type label ("Soru Çözümü") is a placeholder for what's
  // actually assigned -- once real resources are linked, their names are
  // strictly more useful and replace it (falling back to the label for
  // any id that didn't resolve, e.g. a resource deleted after linking).
  const resourceNames = task.resource_ids
    .map((id) => resourceNameById?.get(id))
    .filter((name): name is string => !!name);
  const base = resourceNames.length > 0 ? resourceNames.join(" + ") : (TASK_TYPE_LABELS[task.task_type] ?? task.task_type);
  const countUnit = task.task_type === "branch_exam" ? "adet" : "soru";
  const count = task.total_count !== null ? ` · ${task.total_count} ${countUnit}` : "";
  const duration = task.duration_minutes !== null ? ` · ${task.duration_minutes} dk` : "";
  return `${base}${count}${duration}`;
}

// A single colorful pill -- shared by an individual video's title AND the
// "N video" summary badge, so every video-related indicator on a card
// (whichever one applies) reads as the same visual language as the full
// list shown in TaskCardHoverDetail on hover.
function VideoPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-rose-500/10 text-rose-600 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug">
      <PlayCircle className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

// Default-state video indicator: 1 video shows its own title (as a real
// link); 2+ collapse into a single "N video" summary pill instead of
// stacking individual titles -- since the card's height is now a free
// drag rather than a fixed tier, there's no fixed row budget to cap
// against, just no appetite for an unbounded stack of video rows. Always
// exactly one line, truncated by VideoPill/the card's own overflow-hidden
// if it doesn't fit. Full untruncated list is always one hover away
// (TaskCardHoverDetail).
function CardVideoLinks({ videoLinks }: { videoLinks: DetailTask["video_links"] }) {
  if (videoLinks.length === 0) return null;
  if (videoLinks.length === 1) {
    return (
      <a href={videoLinks[0].url} target="_blank" rel="noreferrer" className="block max-w-full">
        <VideoPill>{videoLinks[0].title || "Video"}</VideoPill>
      </a>
    );
  }
  return <VideoPill>{videoLinks.length} video</VideoPill>;
}

// Default card content -- course name, topic, subtitle, and a video
// indicator, each always rendered as a single truncated (ellipsis) line
// rather than hidden or multi-line clamped. The card's own fixed-but-
// draggable height + overflow-hidden (see kanban-task-card.tsx/
// routine-task-card.tsx) clips whichever rows don't fit when dragged
// short -- deliberately simple, no per-height content profile. Shared by
// KanbanTaskCard (draggable, in a day column) and RoutineTaskCard
// (static, in the Rutinler lane) so the two stay visually identical. Full,
// untruncated detail lives in TaskCardHoverDetail below, shown in a
// HoverCard by the card components themselves.
export function TaskCardBody({ task, resourceNameById }: { task: DetailTask; resourceNameById?: Map<string, string> }) {
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

  return (
    <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
      <p className="text-foreground truncate text-sm leading-snug font-semibold">{cLabel ?? task.title}</p>

      {topic && (
        <p className={cn("truncate text-xs leading-snug", topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground")}>
          {topic.name}
        </p>
      )}

      <p className="text-muted-foreground truncate text-[11px] leading-snug">{subtitleText(task, resourceNameById)}</p>

      <CardVideoLinks videoLinks={task.video_links} />
    </div>
  );
}

// Full, untruncated version of TaskCardBody -- no truncation, topic
// always shown, every video link with its complete title. Rendered inside
// a HoverCard's content on hover, never inline in the grid itself.
export function TaskCardHoverDetail({ task, resourceNameById }: { task: DetailTask; resourceNameById?: Map<string, string> }) {
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

      <p className="text-muted-foreground text-xs leading-snug break-words">{subtitleText(task, resourceNameById)}</p>

      {task.video_links.length > 0 && (
        <div className="flex flex-col items-start gap-1 pt-0.5">
          {task.video_links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="bg-rose-500/10 text-rose-600 inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 text-xs leading-snug"
            >
              <PlayCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{link.title || "Video"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
