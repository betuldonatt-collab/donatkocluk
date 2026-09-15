import { PlayCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import type { ScheduleDensity } from "@/lib/schedule-density";
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

// Three content profiles a coach can pick (see the "Görünüm" toggle in
// schedule-board.tsx, persisted to profiles.schedule_density) -- each is a
// full height+clamp combination, not just a CSS height number, since a
// shorter card genuinely has to show LESS (fewer title lines, no topic,
// fewer video rows) to guarantee it never overflows. Every card sharing
// one tier (KanbanTaskCard, RoutineTaskCard, and the routine-slot
// placeholders in schedule-board.tsx) is always exactly this tall, so the
// weekly grid's strict alignment holds at any density.
export type CardDensity = ScheduleDensity;

type DensityConfig = {
  heightClass: string;
  titleClamp: "line-clamp-1" | "line-clamp-2";
  showTopic: boolean;
  // How many rows CardVideoLinks may use, and whether it's allowed to show
  // an actual video TITLE (vs. only ever a bare "N video" count) -- see
  // CardVideoLinks below.
  videoRows: 0 | 1 | 2;
  videoShowTitles: boolean;
};

export const CARD_DENSITY_CONFIG: Record<CardDensity, DensityConfig> = {
  compact: { heightClass: "h-[112px]", titleClamp: "line-clamp-1", showTopic: false, videoRows: 1, videoShowTitles: false },
  medium: { heightClass: "h-[144px]", titleClamp: "line-clamp-1", showTopic: true, videoRows: 1, videoShowTitles: true },
  comfortable: { heightClass: "h-[180px]", titleClamp: "line-clamp-2", showTopic: true, videoRows: 2, videoShowTitles: true },
};

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

function videoRow(link: DetailTask["video_links"][number], clamp: "line-clamp-1" | "line-clamp-2") {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="bg-rose-500/10 text-rose-600 inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug"
    >
      <PlayCircle className="mt-0.5 size-3 shrink-0" />
      <span className={cn(clamp, "break-words")}>{link.title || "Video"}</span>
    </a>
  );
}

// Default-state video block, shaped by the density tier's videoRows/
// videoShowTitles -- guaranteed to fit its row budget regardless of how
// many links are attached:
//   - videoShowTitles=false (compact): always a single "N video" count,
//     never a title, so a long title can never sneak in a compact card.
//   - videoRows=1 (medium): 1 video -> its title, clamped to 1 line;
//     2+ -> a single "N video eklendi" summary (no individual title, since
//     only one row is available and title+count together wouldn't fit).
//   - videoRows=2 (comfortable): today's behavior -- 1 video gets up to 2
//     lines; 2+ each get 1 line, capped to the first 2 with a "+N daha"
//     row past that.
// The full, untruncated list is always one hover away (TaskCardHoverDetail).
function CardVideoLinks({ videoLinks, density }: { videoLinks: DetailTask["video_links"]; density: CardDensity }) {
  if (videoLinks.length === 0) return null;
  const config = CARD_DENSITY_CONFIG[density];
  if (config.videoRows === 0) return null;

  if (!config.videoShowTitles) {
    return (
      <span className="text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug">
        <PlayCircle className="size-3 shrink-0" />
        {videoLinks.length} video
      </span>
    );
  }

  if (config.videoRows === 1) {
    return (
      <div className="flex flex-col items-start gap-1">
        {videoLinks.length === 1 ? (
          videoRow(videoLinks[0], "line-clamp-1")
        ) : (
          <span className="text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug">
            <PlayCircle className="size-3 shrink-0" />
            {videoLinks.length} video eklendi
          </span>
        )}
      </div>
    );
  }

  // videoRows === 2 (comfortable).
  if (videoLinks.length === 1) {
    return <div className="flex flex-col items-start gap-1">{videoRow(videoLinks[0], "line-clamp-2")}</div>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {videoRow(videoLinks[0], "line-clamp-1")}
      {videoLinks.length === 2 ? (
        videoRow(videoLinks[1], "line-clamp-1")
      ) : (
        <span className="text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-snug">
          +{videoLinks.length - 1} video daha
        </span>
      )}
    </div>
  );
}

// Default card content, shaped entirely by `density` (see
// CARD_DENSITY_CONFIG) -- guaranteed to fit inside that tier's
// heightClass regardless of content. Shared by KanbanTaskCard (draggable,
// in a day column) and RoutineTaskCard (static, in the Rutinler lane) so
// the two stay visually identical. Full, untruncated detail lives in
// TaskCardHoverDetail below, shown in a HoverCard by the card components
// themselves -- topic is always visible there even when this tier hides it.
export function TaskCardBody({
  task,
  resourceNameById,
  density,
}: {
  task: DetailTask;
  resourceNameById?: Map<string, string>;
  density: CardDensity;
}) {
  const cLabel = courseLabel(task.course_id);
  const topic = findTopicById(task.course_id, task.topic_id);
  const config = CARD_DENSITY_CONFIG[density];

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className={cn("text-foreground text-sm leading-snug font-semibold break-words", config.titleClamp)}>{cLabel ?? task.title}</p>

      {config.showTopic && topic && (
        <p
          className={cn(
            "line-clamp-1 text-xs leading-snug break-words",
            topic.id === "karma" ? "text-amber-600 font-medium" : "text-muted-foreground",
          )}
        >
          {topic.name}
        </p>
      )}

      <p className="text-muted-foreground line-clamp-1 text-[11px] leading-snug break-words">{subtitleText(task, resourceNameById)}</p>

      <CardVideoLinks videoLinks={task.video_links} density={density} />
    </div>
  );
}

// Full, untruncated version of TaskCardBody -- no clamping, no density,
// topic always shown, every video link with its complete title. Rendered
// inside a HoverCard's content on hover, never inline in the grid itself.
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
