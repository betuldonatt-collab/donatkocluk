import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { fetchAllPages } from "@/lib/paged-select";
import { buildPhotoPool, type PoolFolder, type PoolTask } from "@/lib/photo-pool";
import { PhotoPoolGallery } from "./photo-pool-gallery";

type FolderRow = { id: string; name: string; course_key?: string | null };
type ItemRow = { photo_path: string; folder_id: string };
type AnnotationRow = { photo_path: string; annotated_path: string };
type PagedResult<T> = PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;

// Fotoğraf Havuzu: every Kanıt Fotoğrafı the student attached to any task, with the coach's own folders. The photos stay where they are (the
// task's evidence_image_paths); this page only gathers them and lets the coach file them (lib/photo-pool.ts, migration 0139).
export default async function PhotoPoolPage(props: PageProps<"/coach/students/[id]/photos">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const view = await getViewContext("coach");
  const coachId = view?.effectiveUserId ?? null;

  // The coach's folders with the course each belongs to (migration 0141); before that column exists they are read without it (all flat).
  async function readFolders(coach: string): Promise<{ data: FolderRow[] | null; error: unknown; hasCourses: boolean }> {
    const query = (columns: string) =>
      supabase.from("student_photo_folders").select(columns).eq("coach_id", coach).eq("student_id", id).order("created_at", { ascending: true }).order("id", { ascending: true });
    const withCourse = (await query("id, name, course_key")) as unknown as { data: FolderRow[] | null; error: { code?: string } | null };
    if (!withCourse.error) return { data: withCourse.data, error: null, hasCourses: true };
    if (withCourse.error.code !== "42703") return { data: null, error: withCourse.error, hasCourses: false };
    const plain = (await query("id, name")) as unknown as { data: FolderRow[] | null; error: unknown };
    return { data: plain.data, error: plain.error, hasCourses: false };
  }

  const [{ data: profile }, tasksRead, foldersRead, itemsRead, annotationsRead] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", id).maybeSingle(),
    fetchAllPages<PoolTask>(
      (from, to, withCount) =>
        supabase
          .from("student_tasks")
          .select("id, task_date, task_type, title, course_id, evidence_image_paths, evidence_photo_status", withCount ? { count: "exact" } : undefined)
          .eq("student_id", id)
          .not("evidence_image_paths", "is", null)
          .order("task_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PagedResult<PoolTask>,
    ),
    coachId ? readFolders(coachId) : Promise.resolve({ data: [] as FolderRow[], error: null, hasCourses: false }),
    coachId
      ? fetchAllPages<ItemRow>(
          (from, to, withCount) =>
            supabase
              .from("student_photo_folder_items")
              .select("photo_path, folder_id", withCount ? { count: "exact" } : undefined)
              .eq("coach_id", coachId)
              .eq("student_id", id)
              .order("photo_path", { ascending: true })
              .range(from, to) as unknown as PagedResult<ItemRow>,
        )
      : Promise.resolve({ data: [] as ItemRow[], error: null }),
    // The coach's own private edited copies (migration 0140); never the student's, parent's or another coach's.
    coachId
      ? fetchAllPages<AnnotationRow>(
          (from, to, withCount) =>
            supabase
              .from("coach_photo_annotations")
              .select("photo_path, annotated_path", withCount ? { count: "exact" } : undefined)
              .eq("coach_id", coachId)
              .eq("student_id", id)
              .order("photo_path", { ascending: true })
              .range(from, to) as unknown as PagedResult<AnnotationRow>,
        )
      : Promise.resolve({ data: [] as AnnotationRow[], error: null }),
  ]);

  // Until migration 0139 is run the folder tables do not exist: the gallery still works, just without folders (and says so).
  const foldersAvailable = !foldersRead.error && !itemsRead.error;
  const folders: PoolFolder[] = foldersAvailable ? (foldersRead.data ?? []).map((f) => ({ id: f.id, name: f.name, courseKey: f.course_key ?? null })) : [];
  const folderIds = new Set(folders.map((f) => f.id));
  const folderByPath = new Map<string, string>();
  if (foldersAvailable) for (const item of itemsRead.data ?? []) if (folderIds.has(item.folder_id)) folderByPath.set(item.photo_path, item.folder_id);

  // Until migration 0140 is run the Pool simply has no editor.
  const annotationsAvailable = !annotationsRead.error && coachId !== null;
  const annotationByPath = new Map<string, string>();
  if (annotationsAvailable) for (const a of annotationsRead.data ?? []) annotationByPath.set(a.photo_path, a.annotated_path);

  const photos = buildPhotoPool(
    tasksRead.data.filter((t) => (t.evidence_image_paths ?? []).length > 0),
    folderByPath,
    annotationByPath,
  );
  const studentName = (profile as { full_name: string | null } | null)?.full_name ?? "Öğrenci";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Link href={`/coach/students/${id}`} className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        {studentName}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Fotoğraf Havuzu</h1>
        <p className="text-muted-foreground text-sm">
          {studentName} görevlerine yüklediği tüm fotoğraflar. Kendi klasörlerini oluştur, fotoğrafları sürükleyip bırak veya seçip taşı.
        </p>
      </header>

      {tasksRead.error ? (
        <p className="text-destructive text-sm">Fotoğraflar yüklenemedi. Sayfayı yenileyip tekrar dene.</p>
      ) : (
        <PhotoPoolGallery studentId={id} initialPhotos={photos} initialFolders={folders} foldersAvailable={foldersAvailable} courseFoldersAvailable={foldersRead.hasCourses} annotationsAvailable={annotationsAvailable} />
      )}
    </div>
  );
}
