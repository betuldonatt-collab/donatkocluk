import { PlayCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import { subjectBackgroundClass, taskStatusBorderClass } from "@/lib/subject-colors";
import { TaskDescription } from "@/components/task-description";
import type { DetailTask } from "../../types";

export const TASK_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Çalışması",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
  reading: "Kitap Okuma",
};

export function courseLabel(courseId: string | null) {
  // "kitap-okuma" resolves to a real pseudo-course (lib/curriculum's
  // ROUTINE_COURSES), but showing its generic "Kitap Okuma" name as the
  // card's TITLE would bury the one thing that actually identifies a
  // reading task -- the book's own name, which already lives directly in
  // task.title. Falling back to null here (same as "no course at all")
  // lets the card title fall through to task.title instead.
  if (courseId === "kitap-okuma") return null;
  const course = findCourseById(courseId);
  if (!course) return null;
  const prefix = courseId?.startsWith("tyt-") ? "TYT " : courseId?.startsWith("ayt-") ? "AYT " : "";
  return `${prefix}${course.name}`;
}

// Thick, full-saturation border for task-completion status -- previously
// a thin left-only accent. See lib/subject-colors.ts for why the border
// deliberately owns emerald/amber/rose exclusively (never used in a
// subject's background tint below).
export function statusClasses(task: DetailTask) {
  return taskStatusBorderClass(task.status, task.completed);
}

// Subject-hierarchical pastel background: each course family gets its own
// hue, progressing lightest (TYT) -> medium (AYT) -> deepest (Branş
// Denemesi) via opacity, same theme-safe bg-{hue}-500/N convention as the
// rest of this app's tinting. General exams keep their original flat
// indigo tint (see lib/subject-colors.ts), since they aren't tied to one
// subject family.
export function cardBackgroundClass(task: DetailTask) {
  return subjectBackgroundClass(task.course_id, task.task_type);
}

// The floor a coach can drag a card down to (see ResizeHandle in
// kanban-task-card.tsx/routine-task-card.tsx) -- tall enough to always
// fit the icon + course/title + topic + subtitle (kaynak or count/
// duration) + the action-icon row, without clipping. Raised from the
// original 84px, which only guaranteed the title line + action row --
// topic/subtitle silently clipped below that, the exact "hidden unless
// you hover" complaint this pass fixes. Still comfortably above the DB
// check constraint's own 56px minimum (migration 0076).
export const MIN_CARD_HEIGHT_PX = 104;
// This panel's own starting height when a coach has never dragged a
// card yet (profiles.schedule_card_height_px is null) -- see
// schedule/page.tsx. Raised alongside the floor above, for room for a
// video pill by default too.
export const DEFAULT_CARD_HEIGHT_PX = 160;

function subtitleText(task: DetailTask, resourceNameById?: Map<string, string>): string {
  // The generic type label ("Soru Çözümü") is a placeholder for what's
  // actually assigned -- once real resources are linked, their names are
  // strictly more useful and replace it (falling back to the label for
  // any id that didn't resolve, e.g. a resource deleted after linking).
  const resourceNames = task.resource_ids
    .map((id) => resourceNameById?.get(id))
    .filter((name): name is string => !!name);
  const base = resourceNames.length > 0 ? resourceNames.join(" + ") : (TASK_TYPE_LABELS[task.task_type] ?? task.task_type);
  const countUnit = task.task_type === "branch_exam" ? "adet" : task.task_type === "reading" ? "sayfa" : "soru";
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
    <span className="bg-rose-500/10 text-rose-600 inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug">
      <PlayCircle className="mt-0.5 size-3 shrink-0" />
      <span className="line-clamp-2 break-words">{children}</span>
    </span>
  );
}

// Default-state video indicator: 1 video shows its own title (as a real
// link); 2+ collapse into a single "N video" summary pill instead of
// stacking individual titles -- no appetite for an unbounded stack of
// video rows regardless of the card's own dragged height. Its title is
// clamped to 2 lines (VideoPill above); the full list is still one hover
// away (TaskCardHoverDetail).
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
// indicator. The card's own dragged/stored height (see
// kanban-task-card.tsx/routine-task-card.tsx) is now a real height with
// overflow-hidden, not a floor -- title/topic/subtitle are line-clamped so
// a clip lands at a line boundary instead of mid-glyph, and the
// description (3 lines) and video pill (2 lines) are clamped too. A card
// with genuinely more content than fits at its row's current height just
// has the rest cut at the box edge; dragging the row's own handle taller
// (every card at that row index together) reveals more. Shared by
// KanbanTaskCard (draggable, in a day column) and RoutineTaskCard (static,
// in the Rutinler lane) so the two stay visually identical. The full,
// untruncated detail is always one hover away via TaskCardHoverDetail
// below, shown in a HoverCard by the card components themselves.
export function TaskCardBody({ task, resourceNameById }: { task: DetailTask; resourceNameById?: Map<string, string> }) {
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-foreground line-clamp-2 text-sm leading-snug font-semibold break-words">{cLabel ?? task.title}</p>

      <TaskDescription text={task.description} lines={3} />

      {topic && (
        <p
          className={cn(
            "line-clamp-1 text-xs leading-snug break-words",
            topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground",
          )}
        >
          {topic.name}
        </p>
      )}

      <p className="text-muted-foreground line-clamp-1 text-[11px] leading-snug break-words">
        {subtitleText(task, resourceNameById)}
      </p>

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

      <TaskDescription text={task.description} lines="all" />

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
