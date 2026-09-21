import { findCourseById, findTopicById, isBranchExamMacroCourseId } from "./curriculum";
import { mondayOf } from "./date";

// Weekly templates ("Şablon Sistemi"): a coach builds a reusable week once
// ("LGS Temel Hafta": 15 sayfa kitap her gün, Okul Tekrarı hafta içi, Cumartesi
// LGS Sözel Deneme ...) and applies it to a student's week in one click.
//
// A template item is exactly an assign-task payload (what the coach's task form
// produces) plus the weekdays it repeats on -- so applying a template creates
// the very same student_tasks rows as assigning each task by hand would. Days
// are 0 = Pazartesi .. 6 = Pazar, matching every other week grid in the app.

export const TEMPLATE_DAY_LABELS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export const TEMPLATE_DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;

export type TemplateTaskType = "question_bank" | "topic_study" | "branch_exam" | "general_exam" | "video" | "reading";

// Same fields as the coach's assign form minus resourceIds: resources belong to
// one student's library, so they can't live in a template shared by many.
export type TemplateTask = {
  taskType: TemplateTaskType;
  courseId?: string | null;
  topicId?: string | null;
  totalCount?: number | null;
  durationMinutes?: number | null;
  videoLinks?: { url: string; title: string | null }[];
  generalExamTrack?: "tyt" | "ayt" | "lgs" | null;
  generalExamPublisher?: string | null;
  branchExamPublisher?: string | null;
  bookTitle?: string | null;
};

export type TemplateItem = { id?: string; days: number[]; task: TemplateTask };

export function isMonday(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && mondayOf(iso) === iso;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The concrete dates an item lands on for a week starting on `weekStart`
// (a Monday), sorted and de-duplicated.
export function templateDates(weekStart: string, days: number[]): string[] {
  return [...new Set(days)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => addDaysIso(weekStart, d));
}

// A "video" task with N links becomes N cards per day (one link each), every
// other task one card per day -- mirrors buildTaskRows in app/coach/actions.ts.
export function rowsPerDate(task: TemplateTask): number {
  return task.taskType === "video" && task.videoLinks && task.videoLinks.length > 1 ? task.videoLinks.length : 1;
}

export function countTemplateTasks(items: TemplateItem[]): number {
  return items.reduce((sum, item) => sum + new Set(item.days).size * rowsPerDate(item.task), 0);
}

// Today's date -> the Monday a coach most likely means: today when it IS a
// Monday, otherwise the coming one.
export function defaultTemplateStart(todayIso: string): string {
  const monday = mondayOf(todayIso);
  return monday === todayIso ? todayIso : addDaysIso(monday, 7);
}

export const TEMPLATE_TASK_TYPE_LABELS: Record<TemplateTaskType, string> = {
  question_bank: "Soru Çözümü",
  topic_study: "Konu Çalışması",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  video: "Video",
  reading: "Kitap Okuma",
};

// One-line description of an item for the template editor / apply preview,
// e.g. "Soru Çözümü · TYT Matematik · 40 soru" or "Kitap Okuma · 15 sayfa".
export function summarizeTemplateTask(task: TemplateTask): string {
  const parts: string[] = [];

  if (task.taskType === "general_exam") {
    const track = task.generalExamTrack === "ayt" ? "AYT" : task.generalExamTrack === "lgs" ? "LGS" : "TYT";
    parts.push(`${track} Genel Deneme`);
  } else if (task.taskType === "reading") {
    parts.push(task.bookTitle?.trim() || "Kitap Okuma");
  } else {
    const course = findCourseById(task.courseId);
    if (course) {
      const prefix = isBranchExamMacroCourseId(course.id)
        ? ""
        : course.id.startsWith("tyt-")
          ? "TYT "
          : course.id.startsWith("ayt-")
            ? "AYT "
            : "";
      const topic = task.taskType === "branch_exam" ? null : findTopicById(course.id, task.topicId);
      // A routine (Paragraf, Yeni Nesil Mat Dozu, ...) reads best as its own name.
      parts.push(`${TEMPLATE_TASK_TYPE_LABELS[task.taskType]} · ${prefix}${course.name}${topic && topic.id !== "karma" ? ` — ${topic.name}` : ""}`);
    } else {
      parts.push(TEMPLATE_TASK_TYPE_LABELS[task.taskType]);
    }
  }

  const count = task.totalCount ?? null;
  if (count) {
    parts.push(
      task.taskType === "reading" ? `${count} sayfa` : task.taskType === "branch_exam" ? `${count} deneme` : `${count} soru`,
    );
  }
  if (task.durationMinutes) parts.push(`${task.durationMinutes} dk`);
  return parts.join(" · ");
}

// "Her gün", "Hafta içi", "Hafta sonu", or the listed days ("Pzt, Çar, Cmt").
export function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Her gün";
  if (set.size === 5 && [0, 1, 2, 3, 4].every((d) => set.has(d))) return "Hafta içi";
  if (set.size === 2 && set.has(5) && set.has(6)) return "Hafta sonu";
  return [...set]
    .sort((a, b) => a - b)
    .map((d) => TEMPLATE_DAY_LABELS_SHORT[d])
    .join(", ");
}
