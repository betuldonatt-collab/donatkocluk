import { courseDisplayName, findCourseById, isRoutineCourseId } from "./curriculum";

// Fotoğraf Havuzu: every Kanıt Fotoğrafı a student ever attached to a task, gathered for the coach and organised into the coach's own folders.
//
// A photo is not a record of its own: it is one entry of a task's `evidence_image_paths` (Storage paths in the private `task_evidence`
// bucket, <student_id>/<task_id>/<uuid>.jpg -- lib/task-evidence.ts), with the coach's per-photo verdict in `evidence_photo_status`. So a photo
// is identified by its Storage PATH (unique, never reused), its date / course / title come from the task it belongs to, and the folders are a
// separate mapping path -> folder (migration 0139). Nothing here changes the task or the file.

export type PhotoVerdict = "approved" | "rejected";

export type PoolTask = {
  id: string;
  task_date: string;
  task_type: string;
  title: string;
  course_id: string | null;
  evidence_image_paths: string[] | null;
  evidence_photo_status?: Record<string, PhotoVerdict> | null;
};

// What a section of the gallery is made of: a course (Standard tasks), the Genel Deneme, a Rutin (Paragraf, Problem, ...) or the rest.
export type GroupKind = "course" | "general" | "routine" | "other";

export type PoolPhoto = {
  path: string;
  taskId: string;
  taskTitle: string;
  taskDate: string;
  courseKey: string;
  courseLabel: string;
  groupKind: GroupKind;
  // The coach's own edited copy (rotated / drawn on), in the private `coach_annotations` bucket -- null = never edited. The student's
  // original (`path`) is never touched, and the student never sees this copy (migration 0140).
  annotatedPath: string | null;
  verdict: PhotoVerdict | null;
  // The coach's folder it sits in; null = in no folder.
  folderId: string | null;
};

export type PoolFolder = { id: string; name: string };

// The group a photo belongs to, derived from its task: a Standard task by its course (Ders), a Rutin task (Paragraf, Problem, Kitap Okuma,
// Yeni Nesil Mat Dozu) by its type as "Rutin - Paragraf", a Genel Deneme (which has no course) as "Genel Deneme", anything else without a
// course as "Diğer".
export function courseOfTask(task: Pick<PoolTask, "task_type" | "course_id">): { key: string; label: string; kind: GroupKind } {
  if (task.task_type === "general_exam") return { key: "genel-deneme", label: "Genel Deneme", kind: "general" };
  if (!task.course_id) return { key: "diger", label: "Diğer", kind: "other" };
  const course = findCourseById(task.course_id);
  if (isRoutineCourseId(task.course_id)) return { key: task.course_id, label: `Rutin - ${course?.name ?? task.course_id}`, kind: "routine" };
  return { key: task.course_id, label: course ? courseDisplayName(task.course_id, course.name) : task.course_id, kind: "course" };
}

// Every photo of the given tasks, newest first (task date, then path so the order is stable). A path listed twice appears once.
export function buildPhotoPool(
  tasks: PoolTask[],
  folderByPath: ReadonlyMap<string, string>,
  annotationByPath: ReadonlyMap<string, string> = new Map(),
): PoolPhoto[] {
  const seen = new Set<string>();
  const photos: PoolPhoto[] = [];
  for (const task of tasks) {
    const course = courseOfTask(task);
    for (const path of task.evidence_image_paths ?? []) {
      if (seen.has(path)) continue;
      seen.add(path);
      photos.push({
        path,
        taskId: task.id,
        taskTitle: task.title,
        taskDate: task.task_date,
        courseKey: course.key,
        courseLabel: course.label,
        groupKind: course.kind,
        annotatedPath: annotationByPath.get(path) ?? null,
        verdict: task.evidence_photo_status?.[path] ?? null,
        folderId: folderByPath.get(path) ?? null,
      });
    }
  }
  return photos.sort((a, b) => b.taskDate.localeCompare(a.taskDate) || a.path.localeCompare(b.path));
}

// --- Sections ---------------------------------------------------------------------------------------------------------------------

export type PhotoGroup = { key: string; label: string; kind: GroupKind; photos: PoolPhoto[] };

const KIND_ORDER: Record<GroupKind, number> = { course: 0, general: 1, routine: 2, other: 3 };

// The photos as gallery sections: courses A-Z, then the Genel Deneme, then the Rutin groups A-Z, then "Diğer". Inside a section the
// photos keep their order (newest task first).
export function groupPhotos(photos: PoolPhoto[]): PhotoGroup[] {
  const byKey = new Map<string, PhotoGroup>();
  for (const p of photos) {
    const group = byKey.get(p.courseKey) ?? { key: p.courseKey, label: p.courseLabel, kind: p.groupKind, photos: [] };
    group.photos.push(p);
    byKey.set(p.courseKey, group);
  }
  return [...byKey.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label, "tr"));
}

// The first `limit` photos of the sections in order (the "Daha fazla göster" window), still grouped; sections past the window are dropped.
export function takeGroups(groups: PhotoGroup[], limit: number): PhotoGroup[] {
  const out: PhotoGroup[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push(left >= g.photos.length ? g : { ...g, photos: g.photos.slice(0, left) });
    left -= g.photos.length;
  }
  return out;
}

// "all" = every photo, "none" = photos in no folder, else a folder id.
export type FolderSelection = "all" | "none" | string;

export type PhotoFilter = {
  folder: FolderSelection;
  // "all" or a course key (courseOptions).
  course: string;
  // Inclusive task-date bounds (YYYY-MM-DD); "" = open.
  from: string;
  to: string;
};

export const NO_FILTER: PhotoFilter = { folder: "all", course: "all", from: "", to: "" };

export function filterPhotos(photos: PoolPhoto[], filter: PhotoFilter): PoolPhoto[] {
  return photos.filter(
    (p) =>
      (filter.folder === "all" || (filter.folder === "none" ? p.folderId === null : p.folderId === filter.folder)) &&
      (filter.course === "all" || p.courseKey === filter.course) &&
      (!filter.from || p.taskDate >= filter.from) &&
      (!filter.to || p.taskDate <= filter.to),
  );
}

// The Ders filter's options: the courses that actually have photos, with how many (so a course with none is never offered).
export function courseOptions(photos: PoolPhoto[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { key: string; label: string; count: number }>();
  for (const p of photos) {
    const entry = byKey.get(p.courseKey) ?? { key: p.courseKey, label: p.courseLabel, count: 0 };
    entry.count += 1;
    byKey.set(p.courseKey, entry);
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

// How many photos each sidebar entry holds.
export function folderCounts(photos: PoolPhoto[]): { all: number; none: number; byFolder: Map<string, number> } {
  const byFolder = new Map<string, number>();
  let none = 0;
  for (const p of photos) {
    if (p.folderId === null) none += 1;
    else byFolder.set(p.folderId, (byFolder.get(p.folderId) ?? 0) + 1);
  }
  return { all: photos.length, none, byFolder };
}

// What a drag moves: dragging a photo that is part of the selection takes the whole selection with it; dragging one that is not takes just that one.
export function pathsToMove(dragged: string, selected: ReadonlySet<string>): string[] {
  return selected.has(dragged) ? [...selected] : [dragged];
}

// The photos after moving `paths` into `folderId` (null = out of every folder) -- applied at once in the browser, before the save answers.
export function applyMove(photos: PoolPhoto[], paths: ReadonlySet<string>, folderId: string | null): PoolPhoto[] {
  return photos.map((p) => (paths.has(p.path) && p.folderId !== folderId ? { ...p, folderId } : p));
}

// A path a coach may ask to see or move: inside the student's own folder, no traversal.
export function isPoolPathFor(path: string, studentId: string): boolean {
  return path.startsWith(`${studentId}/`) && !path.includes("..") && path.length > studentId.length + 1;
}

export const FOLDER_NAME_MAX = 60;

// A folder name as stored: trimmed, inner whitespace collapsed; null when empty or too long.
export function cleanFolderName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= FOLDER_NAME_MAX ? name : null;
}
