"use server";

// Fotoğraf Havuzu actions. Deliberately its OWN small "use server" file (like app/coach/events/actions.ts): a client component importing
// actions out of the giant shared app/coach/actions.ts hits Next.js's production-only "unused server action" bug ("Minified React error #441").
//
// Every action NEVER throws: a thrown Error is redacted to an opaque digest in production, so each resolves to { ok: true, ... } or
// { ok: false, error } and the gallery checks `.ok`.

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { EVIDENCE_BUCKET } from "@/lib/task-evidence";
import { cleanFolderName, courseOfTask, isCourseKey, isPoolPathFor, type PoolFolder } from "@/lib/photo-pool";
import { ANNOTATION_BUCKET, ANNOTATION_MAX_BYTES, annotationPath, isAnnotationPathFor } from "@/lib/photo-annotate";

export type PhotoActionFailure = { ok: false; error: string };
export type FolderResult = { ok: true; folder: PoolFolder } | PhotoActionFailure;
export type RenameResult = { ok: true; folder: { id: string; name: string } } | PhotoActionFailure;
export type OkResult = { ok: true } | PhotoActionFailure;
export type UrlsResult = { ok: true; urls: Record<string, string> } | PhotoActionFailure;
export type AnnotationResult = { ok: true; annotatedPath: string; url: string | null } | PhotoActionFailure;

const DUPLICATE_MESSAGE = "Bu isimde bir klasör zaten var.";
const missingTablesMessage = (what: string, migration: string) => `${what} henüz etkin değil (${migration} numaralı veritabanı güncellemesi çalıştırılmalı).`;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message?: string };

function fail(error: unknown, feature: { what: string; migration: string } = { what: "Klasör özelliği", migration: "0139" }): PhotoActionFailure {
  const e = error as DbError | undefined;
  if (e?.code === "23505") return { ok: false, error: DUPLICATE_MESSAGE };
  // 42P01 = relation does not exist, PGRST205 = not in the schema cache: the migration has not been run yet.
  // 42703 = column does not exist (migration 0141 added folders.course_key).
  if (e?.code === "42P01" || e?.code === "PGRST205") return { ok: false, error: missingTablesMessage(feature.what, feature.migration) };
  if (e?.code === "42703") return { ok: false, error: missingTablesMessage("Derse bağlı klasörler", "0141") };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: dbError(error).message };
}

async function requireCoach(supabase: SupabaseClient, studentId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  const { data: link, error } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id).eq("student_id", studentId).maybeSingle();
  if (error) throw dbError(error);
  if (!link) throw new Error("Bu öğrenci sana atanmamış.");
  return user.id;
}

const nameSchema = z.string().transform((raw, ctx) => {
  const name = cleanFolderName(raw);
  if (name === null) ctx.addIssue({ code: "custom", message: "Klasör adı 1 ile 60 karakter arasında olmalı." });
  return name ?? "";
});

const courseKeySchema = z.string().refine(isCourseKey, "Geçersiz ders.");

// A folder is created UNDER a course (courseKey = the course's key in the Pool: a course id, 'genel-deneme', 'diger').
export async function createPhotoFolder(studentId: string, name: string, courseKey: string): Promise<FolderResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, name: nameSchema, courseKey: courseKeySchema }), { studentId, name, courseKey });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { data, error } = await supabase
      .from("student_photo_folders")
      .insert({ coach_id: coachId, student_id: input.studentId, name: input.name, course_key: input.courseKey })
      .select("id, name, course_key")
      .single();
    if (error) return fail(error);
    return { ok: true, folder: { id: data.id as string, name: data.name as string, courseKey: (data.course_key as string | null) ?? input.courseKey } };
  } catch (error) {
    return fail(error);
  }
}

export async function renamePhotoFolder(studentId: string, folderId: string, name: string): Promise<RenameResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, folderId: uuidSchema, name: nameSchema }), { studentId, folderId, name });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { data, error } = await supabase
      .from("student_photo_folders")
      .update({ name: input.name })
      .eq("id", input.folderId)
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .select("id, name")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return { ok: false, error: "Klasör bulunamadı." };
    return { ok: true, folder: { id: data.id as string, name: data.name as string } };
  } catch (error) {
    return fail(error);
  }
}

// Deleting a folder removes its mapping rows only (on delete cascade): its photos simply return to "Klasörsüz".
export async function deletePhotoFolder(studentId: string, folderId: string): Promise<OkResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, folderId: uuidSchema }), { studentId, folderId });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { error } = await supabase
      .from("student_photo_folders")
      .delete()
      .eq("id", input.folderId)
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId);
    if (error) return fail(error);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const MOVE_MAX = 500;
const CHUNK = 200;

// Puts the photos into the folder (folderId) or takes them out of every folder (null). A photo is in at most one folder of a coach, so
// moving it replaces its previous place.
export async function movePhotosToFolder(studentId: string, paths: string[], folderId: string | null): Promise<OkResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(
      z.object({ studentId: uuidSchema, paths: z.array(z.string().min(1).max(300)).min(1, "Taşınacak fotoğraf seçilmedi.").max(MOVE_MAX, `Tek seferde en fazla ${MOVE_MAX} fotoğraf taşınabilir.`), folderId: uuidSchema.nullable() }),
      { studentId, paths, folderId },
    );
    if (input.paths.some((p) => !isPoolPathFor(p, input.studentId))) throw new Error("Geçersiz fotoğraf.");
    const paths_ = [...new Set(input.paths)];
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);

    if (input.folderId === null) {
      for (let i = 0; i < paths_.length; i += CHUNK) {
        const { error } = await supabase
          .from("student_photo_folder_items")
          .delete()
          .eq("coach_id", coachId)
          .eq("student_id", input.studentId)
          .in("photo_path", paths_.slice(i, i + CHUNK));
        if (error) return fail(error);
      }
      return { ok: true };
    }

    // The folder and its course. (Before migration 0141 there is no course column: every folder then takes any photo, as it always did.)
    const folderQuery = (columns: string) =>
      supabase.from("student_photo_folders").select(columns).eq("id", input.folderId).eq("coach_id", coachId).eq("student_id", input.studentId).maybeSingle();
    let folderRead = (await folderQuery("id, course_key")) as unknown as { data: { id: string; course_key?: string | null } | null; error: DbError | null };
    if (folderRead.error?.code === "42703") folderRead = (await folderQuery("id")) as unknown as typeof folderRead;
    if (folderRead.error) return fail(folderRead.error);
    if (!folderRead.data) return { ok: false, error: "Klasör bulunamadı." };
    const folderCourse = folderRead.data.course_key ?? null;

    // A course folder takes only that course's photos (the course of a photo is the one of its task).
    if (folderCourse !== null) {
      const { data: taskRows, error: tasksError } = await supabase
        .from("student_tasks")
        .select("task_type, course_id, evidence_image_paths")
        .eq("student_id", input.studentId)
        .overlaps("evidence_image_paths", paths_);
      if (tasksError) return fail(tasksError);
      const courseOfPath = new Map<string, string>();
      for (const t of (taskRows ?? []) as { task_type: string; course_id: string | null; evidence_image_paths: string[] | null }[]) {
        const key = courseOfTask(t).key;
        for (const path of t.evidence_image_paths ?? []) courseOfPath.set(path, key);
      }
      if (paths_.some((path) => !courseOfPath.has(path))) return { ok: false, error: "Fotoğraf bulunamadı." };
      if (paths_.some((path) => courseOfPath.get(path) !== folderCourse)) return { ok: false, error: "Bu klasör başka bir derse ait; fotoğraflar sadece kendi dersinin klasörüne taşınabilir." };
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("student_photo_folder_items").upsert(
      paths_.map((photo_path) => ({ coach_id: coachId, student_id: input.studentId, photo_path, folder_id: input.folderId, moved_at: now })),
      { onConflict: "coach_id,student_id,photo_path" },
    );
    if (error) return fail(error);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const URL_MAX = 60;

// Short-lived signed links for the photos on screen (the bucket is private; the coach storage policy also requires the student to be on the
// coach's roster). A path that cannot be signed is simply absent from the result.
export async function getPhotoUrls(studentId: string, paths: string[]): Promise<UrlsResult> {
  try {
    const input = parseInput(z.object({ studentId: uuidSchema, paths: z.array(z.string().min(1).max(300)).max(URL_MAX) }), { studentId, paths });
    if (input.paths.some((p) => !isPoolPathFor(p, input.studentId))) throw new Error("Geçersiz fotoğraf.");
    if (input.paths.length === 0) return { ok: true, urls: {} };
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(input.paths, 3600);
    if (error) return { ok: false, error: GENERIC_DB_ERROR };
    const urls: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
    return { ok: true, urls };
  } catch (error) {
    return fail(error);
  }
}

// --- The coach's private edited copy (rotate / draw) -------------------------------------------------------------------------------------
//
// The student's original is never touched. The edited JPEG goes to the private `coach_annotations` bucket under the COACH's own folder
// (<coach>/<student>/<uuid>.jpg) and a row in coach_photo_annotations points to it; no student / parent policy exists on either (migration 0140).

const ANNOTATION_FEATURE = { what: "Fotoğraf düzenleme", migration: "0140" };
const ANNOTATION_URL_MAX = 60;

// Saves (or replaces) the coach's edited copy of one photo. The previous copy's file is removed once the new one is recorded.
export async function saveAnnotatedPhoto(formData: FormData): Promise<AnnotationResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, photoPath: z.string().min(1).max(300) }), {
      studentId: formData.get("studentId"),
      photoPath: formData.get("photoPath"),
    });
    if (!isPoolPathFor(input.photoPath, input.studentId)) throw new Error("Geçersiz fotoğraf.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Düzenlenmiş fotoğraf bulunamadı." };
    if (file.type !== "image/jpeg") return { ok: false, error: "Düzenlenmiş fotoğraf JPEG olmalı." };
    if (file.size > ANNOTATION_MAX_BYTES) return { ok: false, error: "Düzenlenmiş fotoğraf çok büyük." };

    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);

    const { data: previous, error: previousError } = await supabase
      .from("coach_photo_annotations")
      .select("annotated_path")
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .eq("photo_path", input.photoPath)
      .maybeSingle();
    if (previousError) return fail(previousError, ANNOTATION_FEATURE);

    const path = annotationPath(coachId, input.studentId, crypto.randomUUID());
    // Plain bytes, not the framework's File object (same reason as the student's evidence upload).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(ANNOTATION_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return fail(uploadError, ANNOTATION_FEATURE);

    const { error: recordError } = await supabase.from("coach_photo_annotations").upsert(
      { coach_id: coachId, student_id: input.studentId, photo_path: input.photoPath, annotated_path: path, updated_at: new Date().toISOString() },
      { onConflict: "coach_id,student_id,photo_path" },
    );
    if (recordError) {
      await supabase.storage.from(ANNOTATION_BUCKET).remove([path]); // no orphan file
      return fail(recordError, ANNOTATION_FEATURE);
    }

    const oldPath = (previous as { annotated_path: string } | null)?.annotated_path;
    if (oldPath && oldPath !== path) await supabase.storage.from(ANNOTATION_BUCKET).remove([oldPath]);

    const { data: signed } = await supabase.storage.from(ANNOTATION_BUCKET).createSignedUrl(path, 3600);
    return { ok: true, annotatedPath: path, url: signed?.signedUrl ?? null };
  } catch (error) {
    return fail(error, ANNOTATION_FEATURE);
  }
}

// "Orijinale dön": the coach's edited copy goes away (row and file); the student's original was never changed.
export async function removePhotoAnnotation(studentId: string, photoPath: string): Promise<OkResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, photoPath: z.string().min(1).max(300) }), { studentId, photoPath });
    if (!isPoolPathFor(input.photoPath, input.studentId)) throw new Error("Geçersiz fotoğraf.");
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { data: row, error: readError } = await supabase
      .from("coach_photo_annotations")
      .select("annotated_path")
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .eq("photo_path", input.photoPath)
      .maybeSingle();
    if (readError) return fail(readError, ANNOTATION_FEATURE);
    if (!row) return { ok: true };
    const { error } = await supabase
      .from("coach_photo_annotations")
      .delete()
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .eq("photo_path", input.photoPath);
    if (error) return fail(error, ANNOTATION_FEATURE);
    await supabase.storage.from(ANNOTATION_BUCKET).remove([(row as { annotated_path: string }).annotated_path]);
    return { ok: true };
  } catch (error) {
    return fail(error, ANNOTATION_FEATURE);
  }
}

// Short-lived signed links for the coach's edited copies on screen: edited path -> url. Only the signed-in coach's own copies of this
// student can be signed (the path must sit under <coach>/<student>/; Storage RLS says the same).
export async function getAnnotationUrls(studentId: string, annotatedPaths: string[]): Promise<UrlsResult> {
  try {
    const input = parseInput(z.object({ studentId: uuidSchema, paths: z.array(z.string().min(1).max(300)).max(ANNOTATION_URL_MAX) }), { studentId, paths: annotatedPaths });
    if (input.paths.length === 0) return { ok: true, urls: {} };
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    if (input.paths.some((p) => !isAnnotationPathFor(p, coachId, input.studentId))) throw new Error("Geçersiz fotoğraf.");
    const { data, error } = await supabase.storage.from(ANNOTATION_BUCKET).createSignedUrls(input.paths, 3600);
    if (error) return { ok: false, error: GENERIC_DB_ERROR };
    const urls: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
    return { ok: true, urls };
  } catch (error) {
    return fail(error, ANNOTATION_FEATURE);
  }
}
